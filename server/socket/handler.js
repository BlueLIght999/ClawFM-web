import { EVENTS } from './events.js';
import { queue } from '../services/queue.js';
import { scheduler } from '../services/scheduler.js';
import { recommender } from '../services/recommender.js';
import { generateTransition, streamColdOpen, generateRefillSpeech, chatWithDj, isConfigured as isDjConfigured } from '../services/claude.js';
import { routeIntent } from '../services/router.js';
import { assemblePrompt, getTimeOfDayMood } from '../services/context.js';
import { generateSpeech, isTtsAvailable, getTtsStatus } from '../services/tts.js';
import { getRecentSongIds, saveChatMessage, getUserProfile } from '../db/history.js';
import { getWeather, setClientLocation } from '../services/weather.js';
import { generatePlan, isPlanStale, getPlan } from '../services/planner.js';
import { maybeProactiveSpeech, resetLastSpeechTime, setLastUserChat, setProactiveEnabled } from '../services/proactive.js';
import { SocketEventPublisher } from './SocketEventPublisher.js';

let preRecommendSnapshot = null; // { future: [...], current: {...} } for rejection rollback

export function setupSocketHandler(io) {
  let connectedClients = 0;

  // Wire up scheduler callbacks
  scheduler.onSongChange = async (song) => {
    try {
      const audioUrl = await scheduler.getAudioUrl(song);
      console.log('[Scheduler] onSongChange:', song?.name || song?.title, '| audioUrl:', audioUrl ? 'YES' : 'NULL');
      io.emit(EVENTS.SONG_CHANGE, {
        song,
        startedAt: scheduler.playhead.startedAt,
        audioUrl,
      });
    } catch (e) {
      console.error('[Scheduler] onSongChange error:', e.message);
    }
  };

  scheduler.onDjSpeechNeeded = async (prevSong, nextSong, transitionId) => {
    let speechHandled = false;
    try {
    if (!nextSong) {
      // Queue exhausted — refill and generate recommendation speech
      const cachedPlan = getPlan();
      const newSongs = await recommender.fillQueue(15, cachedPlan?.plan?.blocks || null);
      if (newSongs.length > 0) {
        io.emit(EVENTS.QUEUE_UPDATE, { upcomingSongs: queue.upcomingSongs, mode: queue.mode });
        const next = queue.peek();
        if (!next) { speechHandled = true; scheduler.speechComplete(); return; }
        const weather = await getWeather();
        const refill = await generateRefillSpeech(queue.upcomingSongs.slice(0, 3), weather, getTimeOfDayMood());
        if (refill?.say) {
          io.emit(EVENTS.DJ_MESSAGE, { text: refill.say, timestamp: Date.now() });
          const speechText = refill.say.replace(/<[^>]+>/g, '');
          const audioUrl = (isTtsAvailable() === false) ? null : await generateSpeech(speechText);
          if (audioUrl) {
            if (scheduler._transitionId !== transitionId || scheduler.isPlaying) return;
            io.emit(EVENTS.DJ_SPEECH_START, { audioUrl, text: refill.say, type: 'refill' });
            resetLastSpeechTime();
            // Estimate speech duration: ~15 chars per second
            scheduler.speechGenerationDone(speechText.length / 15);
            speechHandled = true;
            return;
          }
          // No TTS — pause so DJ text is readable
          console.log('[Socket] TTS unavailable for refill — pausing 2.5s');
          await new Promise(r => setTimeout(r, 2500));
        }
        speechHandled = true; scheduler.speechComplete();
      }
      return;
    }

    // Generate DJ transition script
    const weather = await getWeather();
    const t = getTimeOfDayMood();
    const contextPrompt = assemblePrompt({ environment: { weather } });
    const transition = await generateTransition(prevSong, nextSong, t, contextPrompt);

    if (transition?.say) {
      // Broadcast text
      io.emit(EVENTS.DJ_MESSAGE, { text: transition.say, timestamp: Date.now() });

      // Generate TTS speech
      const speech = transition.say.replace(/<[^>]+>/g, ''); // strip emotion tags
      const ttsOk = isTtsAvailable();
      const audioUrl = (ttsOk === false) ? null : await generateSpeech(speech);

      if (audioUrl) {
        // Guard: if music already started (safety timeout raced us), drop stale speech
        if (scheduler._transitionId !== transitionId || scheduler.isPlaying) return;
        io.emit(EVENTS.DJ_SPEECH_START, { audioUrl, text: transition.say });
        resetLastSpeechTime();
        // Estimate speech duration: ~15 chars per second
        scheduler.speechGenerationDone(speech.length / 15);
        speechHandled = true;
        // Client will emit dj-speech-finished → scheduler.speechComplete()
        return; // Speech started — wait for client
      }
      // No TTS — pause so DJ text is readable before next song
      console.log('[Socket] TTS unavailable for transition — pausing 3s');
      await new Promise(r => setTimeout(r, 3000));
    }
    // No speech generated — advance
    speechHandled = true; scheduler.speechComplete();
    } catch (err) {
      console.error('[Scheduler] onDjSpeechNeeded error:', err.message);
      if (!speechHandled) scheduler.speechComplete();
    }
  };

  scheduler.onStateChange = (state) => {
    io.emit(EVENTS.PLAYBACK_POSITION, {
      elapsed: state.elapsed,
      duration: state.duration,
    });
  };

  // Initialize queue on startup
  queue.init();

  io.on('connection', async (socket) => {
    connectedClients++;
    const isFirstClient = connectedClients === 1;
    console.log(`[Socket] Client connected: ${socket.id} (total: ${connectedClients})`);

    // If first client after all disconnected, reset for fresh cold start
    if (isFirstClient) {
      console.log('[Socket] First client — resetting for fresh session');
      scheduler.coldStartState = 'pending';
      if (scheduler.isPlaying) {
        scheduler.pause();
        scheduler.playhead.currentSong = null;
        scheduler.playhead.isPlaying = false;
      }
    }

    // Send full current state immediately — ensure audioUrl is fresh
    const state = scheduler.getState();
    if (state.currentSong && !state.audioUrl) {
      const url = await scheduler.getAudioUrl(state.currentSong);
      if (url) state.audioUrl = url;
    }
    socket.emit(EVENTS.RADIO_STATE, state);

    // Send current plan to newly connected client
    const currentPlan = getPlan();
    if (currentPlan) {
      socket.emit(EVENTS.PLAN_UPDATE, currentPlan.plan);
    }

    // Send TTS status
    socket.emit('tts:status', getTtsStatus());

    // === Cold Start (triggered by client:ready) ===
    async function triggerColdStart() {
      // Move a song to current if we have songs waiting
      if (!queue.hasCurrent && queue.future.length > 0) {
        queue.advance();
      }
      if (scheduler.coldStartState !== 'pending' || scheduler.isPlaying
          || scheduler.isAdvancing || scheduler.playhead.currentSong || !queue.hasCurrent) {
        return;
      }
      scheduler.coldStartState = 'in-progress';
      const firstSong = queue.current;
      try {
        const weather = await getWeather();
        const timeOfDay = getTimeOfDayMood();
        const coldMsgId = Date.now().toString();

        // Phase 1: LLM writing
        io.emit('cold-start:phase', { phase: 'writing' });

        // Stream cold open text to chat box
        const fullText = await streamColdOpen(firstSong, weather, timeOfDay, (token) => {
          io.emit(EVENTS.DJ_STREAM_CHUNK, { messageId: coldMsgId, token });
        });
        io.emit(EVENTS.DJ_STREAM_END, { messageId: coldMsgId, fullText });

        if (fullText) {
          io.emit(EVENTS.DJ_MESSAGE, { text: fullText, timestamp: Date.now() });

          // Phase 2: generating TTS
          io.emit('cold-start:phase', { phase: 'speaking' });

          // Trim for TTS — limit to ~200 chars, break at sentence boundary
          const cleanText = fullText.replace(/<[^>]+>/g, '');
          const sentenceEnd = Math.max(
            cleanText.lastIndexOf('。', 200),
            cleanText.lastIndexOf('！', 200),
            cleanText.lastIndexOf('？', 200),
            cleanText.lastIndexOf('.', 200),
            cleanText.lastIndexOf('!', 200),
            cleanText.lastIndexOf('?', 200),
          );
          const speechText = sentenceEnd > 30 ? cleanText.slice(0, sentenceEnd + 1) : cleanText.slice(0, 200);

          let audioUrl = null;
          if (isTtsAvailable() !== false) {
            audioUrl = await generateSpeech(speechText);

            // Retry once with shorter text on failure
            if (!audioUrl) {
              console.log('[Socket] Cold start TTS first attempt failed, retrying with shorter text...');
              const sentences = speechText.split(/[。！？\.!\?]/).filter(Boolean);
              const shorterText = sentences.slice(0, 2).join('。') + (sentences.length > 2 ? '。' : '');
              if (shorterText && shorterText.length < speechText.length && shorterText.length > 5) {
                await new Promise(r => setTimeout(r, 1000));
                audioUrl = await generateSpeech(shorterText);
              }
            }
          } else {
            console.log('[Socket] Cold start — TTS known unavailable, skipping generateSpeech');
          }

          if (audioUrl) {
            io.emit(EVENTS.DJ_SPEECH_START, { audioUrl, text: fullText, type: 'cold-start' });
            // Safety timeout: if speech never ends, start music anyway
            setTimeout(async () => {
              if (scheduler.coldStartState === 'in-progress') {
                console.log('[Socket] Cold start safety timeout — starting music');
                scheduler.coldStartState = 'done';
                await scheduler.startWithQueue();
                io.emit(EVENTS.RADIO_STATE, scheduler.getState());
              }
            }, 30000);
          } else {
            // TTS completely failed — text-only intro with brief pause for user to read
            console.log('[Socket] Cold start TTS failed after retry, using text-only intro');
            const status = getTtsStatus();
            io.emit('cold-start:phase', { phase: 'text-only', text: fullText, reason: status.reason || 'TTS unavailable' });
            await new Promise(r => setTimeout(r, 3500));
            scheduler.coldStartState = 'done';
            await scheduler.startWithQueue();
            io.emit(EVENTS.RADIO_STATE, scheduler.getState());
            io.emit(EVENTS.QUEUE_UPDATE, { upcomingSongs: queue.upcomingSongs, mode: queue.mode });
          }
        } else { throw new Error('Cold open returned empty text'); }
      } catch (e) {
        console.log('[Socket] Cold start failed (' + e.message + '), starting music directly');
        scheduler.coldStartState = 'done';
        await scheduler.startWithQueue();
        io.emit(EVENTS.RADIO_STATE, scheduler.getState());
        io.emit(EVENTS.QUEUE_UPDATE, { upcomingSongs: queue.upcomingSongs, mode: queue.mode });
      }
    }

    // Client signals ready (logged in + connected) → trigger cold start
    socket.on('client:ready', () => {
      console.log(`[Socket] Client ${socket.id} ready — triggering cold start`);
      triggerColdStart();
    });

    // === Auth Events ===
    socket.on(EVENTS.AUTH_LOGIN_PHONE, async ({ phone, password }) => {
      try {
        const { phoneLogin } = await import('../services/netease.js');
        const result = await phoneLogin(phone, password);
        const profile = result.profile || result.account;
        socket.emit('auth:login-success', { profile });

        // Initialize recommender
        const uid = String(profile?.userId || result.account?.id || '');
        await recommender.init(uid);

        // Reset cold start for re-login without page refresh
        scheduler.coldStartState = 'pending';

        // Build initial queue from user's playlists/likes
        // (cold start handles music startup — don't call startWithQueue here)
        const songs = await recommender.fillQueue(20);
        if (songs.length > 0 || !queue.isEmpty) {
          socket.emit(EVENTS.QUEUE_UPDATE, { upcomingSongs: queue.upcomingSongs });
        }
      } catch (e) {
        socket.emit(EVENTS.ERROR, { code: 'AUTH_FAILED', message: e.message });
      }
    });

    socket.on(EVENTS.AUTH_LOGIN_QR_START, async () => {
      try {
        const { createQrLogin, checkQrLogin } = await import('../services/netease.js');
        const result = await createQrLogin();
        socket.emit('auth:qr-created', {
          key: result.unikey || result.data?.unikey,
          qrUrl: `https://music.163.com/login?codekey=${result.unikey || result.data?.unikey}`,
          qrimg: result.qrimg || result.data?.qrimg || null,
        });

        // Poll for QR scan
        const pollInterval = setInterval(async () => {
          try {
            const check = await checkQrLogin(result.unikey || result.data?.unikey);
            // NetEase API codes: 800=expired, 801=waiting, 802=scanned, 803=success
            if (check.code === 803) {
              // Logged in successfully — cookie was saved by callApi
              clearInterval(pollInterval);
              const { checkLoginStatus } = await import('../services/netease.js');
              const loginStatus = await checkLoginStatus();
              const profile = loginStatus.profile || loginStatus.account;
              socket.emit('auth:login-success', { profile });
              const uid = String(profile?.userId || '');
              await recommender.init(uid);
              // Reset cold start for re-login without page refresh
              scheduler.coldStartState = 'pending';
              // (cold start handles music startup — don't call startWithQueue here)
              const songs = await recommender.fillQueue(20);
              if (songs.length > 0 || !queue.isEmpty) {
                socket.emit(EVENTS.QUEUE_UPDATE, { upcomingSongs: queue.upcomingSongs });
              }
            } else if (check.code === 801) {
              // Waiting for scan
              socket.emit('auth:qr-status', { status: 'waiting-scan' });
            } else if (check.code === 802) {
              // Scanned, waiting for confirm
              socket.emit('auth:qr-status', { status: 'scanned' });
            } else if (check.code === 800) {
              // QR code expired
              clearInterval(pollInterval);
              socket.emit('auth:qr-expired');
            }
          } catch { /* keep polling */ }
        }, 2000);

        socket.on('disconnect', () => clearInterval(pollInterval));
      } catch (e) {
        socket.emit(EVENTS.ERROR, { code: 'QR_FAILED', message: e.message });
      }
    });

    // === Player Controls ===
    socket.on('player:skip-to-index', async ({ index }) => {
      if (index == null || index < 0 || index >= queue.future.length) return;
      // Remove all songs before the target index
      if (index > 0) queue.future.splice(0, index);
      await scheduler.skip();
      io.emit(EVENTS.RADIO_STATE, scheduler.getState());
      io.emit(EVENTS.QUEUE_UPDATE, { upcomingSongs: queue.upcomingSongs, mode: queue.mode });
    });

    socket.on(EVENTS.PLAYER_SKIP, async () => {
      await scheduler.skip();
      io.emit(EVENTS.RADIO_STATE, scheduler.getState());
      io.emit(EVENTS.QUEUE_UPDATE, { upcomingSongs: queue.upcomingSongs, mode: queue.mode });
      // Refill queue in background
      if (queue.needsMore(10)) {
        const cachedPlan = getPlan();
        recommender.fillQueue(12, cachedPlan?.plan?.blocks || null).then(() => {
          io.emit(EVENTS.QUEUE_UPDATE, { upcomingSongs: queue.upcomingSongs, mode: queue.mode });
        });
      }
    });

    socket.on(EVENTS.PLAYER_PREVIOUS, async () => {
      await scheduler.previous();
      io.emit(EVENTS.RADIO_STATE, scheduler.getState());
      io.emit(EVENTS.QUEUE_UPDATE, { upcomingSongs: queue.upcomingSongs, mode: queue.mode });
    });

    socket.on(EVENTS.PLAYER_PAUSE, () => {
      scheduler.pause();
      io.emit(EVENTS.PAUSE);
      io.emit(EVENTS.CRAB_ANIMATION, { state: 'idle' });
    });

    socket.on(EVENTS.PLAYER_RESUME, () => {
      scheduler.resume();
      io.emit(EVENTS.RESUME, { startedAt: scheduler.playhead.startedAt });
    });

    socket.on(EVENTS.PLAYER_SET_MODE, ({ mode }) => {
      if (['sequential', 'shuffle', 'fm'].includes(mode)) {
        queue.setMode(mode);
        io.emit(EVENTS.QUEUE_UPDATE, { upcomingSongs: queue.upcomingSongs, mode });
      }
    });

    socket.on(EVENTS.PLAYER_SEEK, ({ position }) => {
      scheduler.seek(position);
      io.emit(EVENTS.PLAYBACK_POSITION, scheduler.getPlaybackPosition());
    });

    socket.on('player:ended', async () => {
      if (scheduler.isAdvancing) return;
      await scheduler.skip();
      io.emit(EVENTS.RADIO_STATE, scheduler.getState());
      io.emit(EVENTS.QUEUE_UPDATE, { upcomingSongs: queue.upcomingSongs, mode: queue.mode });
    });

    // === Chat ===
    socket.on(EVENTS.CHAT_MESSAGE, async ({ text }) => {
      setLastUserChat(text);
      console.log('[Chat] Received:', text?.slice(0, 80));
      console.log('[Chat] DJ configured:', isDjConfigured());

      if (!isDjConfigured()) {
        socket.emit(EVENTS.DJ_MESSAGE, {
          text: "DJ booth is offline — DeepSeek API key not configured yet.",
        });
        return;
      }

      // Route intent: fast commands → direct; NL → Claude
      const routing = await routeIntent(text);
      console.log('[Chat] Route result:', routing?.route, routing?.action, routing?.params);

      let toolResults = '';

      if (routing.route === 'ncm' && routing.action === 'skip') {
        await scheduler.skip();
        io.emit(EVENTS.RADIO_STATE, scheduler.getState());
        return;
      }
      if (routing.route === 'ncm' && routing.action === 'pause') {
        scheduler.pause();
        io.emit(EVENTS.PAUSE); return;
      }
      if (routing.route === 'ncm' && routing.action === 'resume') {
        scheduler.resume();
        io.emit(EVENTS.RESUME, { startedAt: scheduler.playhead.startedAt }); return;
      }
      if (routing.route === 'ncm' && routing.action === 'now_playing') {
        const st = scheduler.getState();
        socket.emit(EVENTS.RADIO_STATE, st); return;
      }
      if (routing.route === 'ncm' && routing.action === 'recommend') {
        preRecommendSnapshot = {
          future: [...queue.future],
          current: queue.current ? { ...queue.current } : null,
        };
        const added = await recommender.fillQueue(10);
        io.emit(EVENTS.QUEUE_UPDATE, { upcomingSongs: queue.upcomingSongs, mode: queue.mode });
        const profile = getUserProfile();
        const topNames = (profile.topArtists || []).slice(0, 5).map(a => a.name).join(', ');
        toolResults = `DJ picked ${added.length} fresh tracks based on the listener's taste profile. Top artists: ${topNames || 'unknown'}. Acknowledge briefly and naturally in Chinese.`;
      }
      if (routing.route === 'ncm' && routing.action === 'plan_refresh') {
        const newPlan = await generatePlan(true);
        io.emit(EVENTS.PLAN_UPDATE, newPlan);
        recommender.setPlanBlocks(newPlan.blocks);
        await recommender.fillQueue(15, newPlan.blocks);
        io.emit(EVENTS.QUEUE_UPDATE, { upcomingSongs: queue.upcomingSongs, mode: queue.mode });
        toolResults = 'Generated a fresh listening plan with a different vibe. Acknowledge the style shift naturally in Chinese.';
      }
      if (routing.route === 'ncm' && routing.action === 'plan_select') {
        // Extract block index from text ("切换到第二个主题" → index 1)
        const match = text.match(/第([一二三四五]|[0-9]+)/);
        let idx = 0;
        if (match) {
          const numMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5 };
          const n = match[1];
          idx = numMap[n] || (parseInt(n, 10) - 1) || 0;
        }
        const cachedPlan = getPlan();
        const blocks = cachedPlan?.plan?.blocks || [];
        if (blocks.length > 0) {
          recommender._planProgress.autoMode = false;
          recommender._planProgress.currentBlockIndex = idx;
          recommender._planProgress.songsFilledInBlock = 0;
          await recommender.fillQueue(12, blocks);
          io.emit(EVENTS.QUEUE_UPDATE, { upcomingSongs: queue.upcomingSongs });
          io.emit(EVENTS.PLAN_UPDATE, { ...cachedPlan?.plan, activeBlockIndex: idx });
        }
        toolResults = `Switched to block #${idx + 1}. Acknowledge this briefly.`;
      }
      if (routing.route === 'ncm' && routing.action === 'plan_pin') {
        const cachedPlan = getPlan();
        const blocks = cachedPlan?.plan?.blocks || [];
        const activeIdx = recommender._planProgress.currentBlockIndex;
        if (blocks.length > 0) {
          recommender._planProgress.pinned = true;
          recommender._planProgress.autoMode = false;
          await recommender.fillQueue(12, blocks);
          io.emit(EVENTS.QUEUE_UPDATE, { upcomingSongs: queue.upcomingSongs });
          io.emit(EVENTS.PLAN_UPDATE, { ...cachedPlan?.plan, activeBlockIndex: activeIdx, pinnedBlockIndex: activeIdx });
        }
        toolResults = 'Pinned the current block style. Acknowledge briefly.';
      }
      if (routing.route === 'ncm' && routing.action === 'plan_clear') {
        recommender._planProgress.autoMode = true;
        recommender._planProgress.pinned = false;
        const cachedPlan = getPlan();
        const blocks = cachedPlan?.plan?.blocks || [];
        await recommender.fillQueue(12, blocks);
        io.emit(EVENTS.QUEUE_UPDATE, { upcomingSongs: queue.upcomingSongs });
        io.emit(EVENTS.PLAN_UPDATE, { ...cachedPlan?.plan, activeBlockIndex: null, pinnedBlockIndex: null });
        toolResults = 'Back to auto mode. Acknowledge briefly.';
      }

      // Clear snapshot on non-rejection messages (user has moved on)
      const rejectionActions = ['reject_recommend', 'recommend_rollback', 'recommend_retry'];
      if (!rejectionActions.includes(routing.action) && preRecommendSnapshot) {
        preRecommendSnapshot = null;
      }

      // === Personalized recommendation (uses full recommender pipeline) ===
      if (routing.action === 'play_personalized') {
        // Save snapshot for possible rollback
        preRecommendSnapshot = {
          future: [...queue.future],
          current: queue.current ? { ...queue.current } : null,
        };
        const oldFuture = [...queue.future];
        // Clear future so new recommendations fill from the front
        queue.future = [];
        const preference = routing.params?.preference;
        let added;
        if (preference) {
          added = await recommender.fillQueueByPreference(preference, 10);
        } else {
          added = await recommender.fillQueue(10);
        }
        // Fallback: if recommender returned nothing, try a generic search
        if (added.length === 0) {
          const { searchSongs } = await import('../services/netease.js');
          const profile = getUserProfile();
          const fallbackQuery = preference || (profile.topArtists || []).slice(0, 1).map(a => a.name).join(' ') || '热门';
          console.log(`[Handler] play_personalized fallback: searching "${fallbackQuery}"`);
          const res = await searchSongs(fallbackQuery, 10);
          const songs = (res?.result?.songs || []).slice(0, 5);
          if (songs.length > 0) {
            for (const s of songs) queue.future.push(s);
            added = songs;
          }
        }
        // Restore old future after new recommendations
        queue.future.push(...oldFuture);
        console.log(`[Handler] play_personalized: preference="${preference || ''}", added=${added.length}, queue.future=${queue.future.length}`);
        io.emit(EVENTS.QUEUE_UPDATE, { upcomingSongs: queue.upcomingSongs, mode: queue.mode });
        const profile = getUserProfile();
        const topNames = (profile.topArtists || []).slice(0, 5).map(a => a.name).join(', ');
        toolResults = `DJ used personalized recommendation pipeline${preference ? ` for "${preference}"` : ''}. Added ${added.length} songs to queue. Listener's top artists: ${topNames || 'none yet'}. Seed pool: ${recommender.seedPool.length} songs. Queue now has ${queue.future.length} upcoming tracks. Pre-recommendation snapshot saved. Respond naturally in Chinese — mention 1-2 highlights, don't list all. If added=0, apologize briefly.`;
      }

      // === Rejection: user doesn't like the recommendations ===
      if (routing.action === 'reject_recommend') {
        if (preRecommendSnapshot) {
          toolResults = `Listener rejected the last batch of recommendations. Pre-recommendation queue snapshot is available (${preRecommendSnapshot.future.length} songs). You MUST ask the listener: "要不要回到推荐之前的歌单，还是我再换一批给你？" Keep it brief and natural in Chinese. Do NOT take any action yet — just ask the question.`;
        } else {
          toolResults = `Listener seems unhappy with the music but no snapshot is available to roll back. Sympathize briefly and offer to find something different. Do NOT take any action — just respond naturally in Chinese.`;
        }
      }

      // === Rollback: restore pre-recommendation queue ===
      if (routing.action === 'recommend_rollback') {
        if (preRecommendSnapshot) {
          queue.future = preRecommendSnapshot.future;
          io.emit(EVENTS.QUEUE_UPDATE, { upcomingSongs: queue.upcomingSongs, mode: queue.mode });
          const count = preRecommendSnapshot.future.length;
          preRecommendSnapshot = null;
          toolResults = `Restored the pre-recommendation queue (${count} songs). Acknowledge briefly in Chinese — "已经回到之前的歌单了" style.`;
        } else {
          toolResults = `No snapshot available to roll back to. Apologize briefly and offer to find something fresh. Respond in Chinese.`;
        }
      }

      // === Retry: recommend again with different sources ===
      if (routing.action === 'recommend_retry') {
        preRecommendSnapshot = {
          future: [...queue.future],
          current: queue.current ? { ...queue.current } : null,
        };
        const added = await recommender.fillQueue(10);
        io.emit(EVENTS.QUEUE_UPDATE, { upcomingSongs: queue.upcomingSongs, mode: queue.mode });
        toolResults = `Re-recommended ${added.length} fresh tracks using different sources. Acknowledge naturally in Chinese — "这次换了一批风格，希望你喜欢" style. Do not list all songs.`;
      }

      // Handle search results from router (ncm or hybrid) — queue ALL songs
      if (routing.results?.length > 0) {
        const songs = routing.results;
        console.log('[Chat] Queueing songs:', songs.map(s => s.name + ' (' + (s.ar||[]).map(a=>a.name).join(',') + ')'));
        // insertNext uses unshift — iterate in reverse to preserve order
        for (let i = songs.length - 1; i >= 0; i--) {
          queue.insertNext(songs[i]);
        }
        io.emit(EVENTS.QUEUE_UPDATE, { upcomingSongs: queue.upcomingSongs, mode: queue.mode });

        // Build context so the AI DJ can acknowledge naturally
        const songList = songs.map(s => {
          const name = s.name || s.title || 'Unknown';
          const artist = (s.ar || []).map(a => a.name).join(', ') || s.artist || '';
          return `${name} by ${artist}`;
        }).join('; ');
        toolResults = `Search matched ${songs.length} song(s): ${songList}. These are now queued. Acknowledge this briefly and naturally in your DJ style — mention 1-2 highlights, don't list all of them.`;
      }

      // Stream DJ response
      const weather = await getWeather();
      const contextPrompt = assemblePrompt({
        userInput: text,
        toolResults,
        environment: { weather },
        execTrace: { lastAction: routing.action, queueLength: queue.length, mode: queue.mode },
      });

      const stream = await chatWithDj(text, contextPrompt);
      if (!stream) {
        socket.emit(EVENTS.DJ_MESSAGE, {
          text: "Sorry, the DJ booth is having technical difficulties. Try again later.",
        });
        return;
      }

      const messageId = Date.now().toString();
      let fullText = '';

      try {
        for await (const chunk of stream) {
          const token = chunk.choices?.[0]?.delta?.content;
          if (token) {
            fullText += token;
            socket.emit(EVENTS.DJ_STREAM_CHUNK, { messageId, token });
          }
        }

        // Parse structured JSON output — extract only the "say" field for chat display
        let displayText = fullText;
        try {
          const parsed = JSON.parse(fullText);
          if (parsed.say) displayText = parsed.say;
        } catch {
          // Not JSON — use raw text as-is
        }

        socket.emit(EVENTS.DJ_STREAM_END, { messageId, fullText: displayText });
        saveChatMessage('assistant', displayText);

        // Chat announce TTS for song-request actions
        const songRequestActions = ['play_search', 'play_mood', 'play_artist', 'play_song', 'recommend', 'plan_refresh'];
        if (songRequestActions.includes(routing.action) && displayText && isTtsAvailable() !== false) {
          // Extract first 1-2 sentences for brief TTS announcement
          const shortText = displayText.split(/[。！？\.!\?]/).filter(Boolean).slice(0, 2).join('。') || displayText.slice(0, 100);
          generateSpeech(shortText).then(audioUrl => {
            if (audioUrl) {
              io.emit(EVENTS.DJ_SPEECH_START, { audioUrl, text: shortText, type: 'chat-announce' });
              resetLastSpeechTime();
            }
          }).catch(() => {});
        }
      } catch (e) {
        console.error('[Socket] Stream error:', e.message);
        socket.emit(EVENTS.DJ_STREAM_END, { messageId, fullText: fullText || text });
      }
    });

    socket.on(EVENTS.CRAB_CLICK, ({ interaction }) => {
      switch (interaction) {
        case 'skip':
          scheduler.skip().then(() => {
            io.emit(EVENTS.RADIO_STATE, scheduler.getState());
          });
          break;
        case 'chat':
          io.emit(EVENTS.CRAB_ANIMATION, { state: 'talking' });
          break;
        case 'boop':
          io.emit(EVENTS.CRAB_ANIMATION, { state: 'bouncing' });
          setTimeout(() => io.emit(EVENTS.CRAB_ANIMATION, { state: 'idle' }), 2000);
          break;
        default:
          io.emit(EVENTS.CRAB_ANIMATION, { state: 'bouncing' });
      }
    });

    socket.on('dj-speech-finished', (data) => {
      io.emit(EVENTS.DJ_SPEECH_END);
      io.emit(EVENTS.CRAB_ANIMATION, { state: 'idle' });

      if (data?.type === 'cold-start') {
        scheduler.coldStartState = 'done';
        scheduler.startWithQueue().then(() => {
          io.emit(EVENTS.RADIO_STATE, scheduler.getState());
          io.emit(EVENTS.QUEUE_UPDATE, { upcomingSongs: queue.upcomingSongs, mode: queue.mode });
        });
      } else if (data?.type !== 'chat' && data?.type !== 'chat-announce') {
        scheduler.speechComplete();
        io.emit(EVENTS.RADIO_STATE, scheduler.getState());
        io.emit(EVENTS.QUEUE_UPDATE, { upcomingSongs: queue.upcomingSongs, mode: queue.mode });
      }
    });

    // === Plan block interaction ===
    socket.on('plan:select-block', async ({ blockIndex }) => {
      if (blockIndex === null || blockIndex === undefined) {
        // Clear selection → resume auto
        recommender._planProgress.autoMode = true;
      } else {
        recommender._planProgress.autoMode = false;
        recommender._planProgress.currentBlockIndex = blockIndex;
        recommender._planProgress.songsFilledInBlock = 0;
      }
      // Refill queue with selected block's hints
      const cachedPlan = getPlan();
      const blocks = cachedPlan?.plan?.blocks || [];
      if (blocks.length > 0) {
        await recommender.fillQueue(12, blocks);
        io.emit(EVENTS.QUEUE_UPDATE, { upcomingSongs: queue.upcomingSongs, mode: queue.mode });
      }
      io.emit(EVENTS.PLAN_UPDATE, { ...cachedPlan?.plan, activeBlockIndex: blockIndex });
    });

    socket.on('plan:pin-block', async ({ blockIndex }) => {
      if (blockIndex === null || blockIndex === undefined) {
        recommender._planProgress.pinned = false;
        recommender._planProgress.autoMode = true;
      } else {
        recommender._planProgress.pinned = true;
        recommender._planProgress.autoMode = false;
        recommender._planProgress.currentBlockIndex = blockIndex;
        recommender._planProgress.songsFilledInBlock = 0;
      }
      const cachedPlan = getPlan();
      const blocks = cachedPlan?.plan?.blocks || [];
      if (blocks.length > 0) {
        await recommender.fillQueue(12, blocks);
        io.emit(EVENTS.QUEUE_UPDATE, { upcomingSongs: queue.upcomingSongs, mode: queue.mode });
      }
      io.emit(EVENTS.PLAN_UPDATE, { ...cachedPlan?.plan, activeBlockIndex: blockIndex, pinnedBlockIndex: blockIndex });
    });

    socket.on('plan:clear-selection', async () => {
      recommender._planProgress.autoMode = true;
      recommender._planProgress.pinned = false;
      const cachedPlan = getPlan();
      const blocks = cachedPlan?.plan?.blocks || [];
      if (blocks.length > 0) {
        await recommender.fillQueue(12, blocks);
        io.emit(EVENTS.QUEUE_UPDATE, { upcomingSongs: queue.upcomingSongs, mode: queue.mode });
      }
      io.emit(EVENTS.PLAN_UPDATE, { ...cachedPlan?.plan, activeBlockIndex: null, pinnedBlockIndex: null });
    });

    socket.on('proactive:toggle', ({ enabled }) => {
      setProactiveEnabled(enabled);
      socket.emit('proactive:state', { enabled });
    });

    socket.on(EVENTS.SONG_REQUEST, async ({ query }) => {
      if (!query) return;
      const { searchSongs } = await import('../services/netease.js');
      try {
        const res = await searchSongs(query, 5);
        const songs = res.result?.songs || [];
        if (songs.length > 0) {
          queue.insertNext(songs[0]);
          io.emit(EVENTS.QUEUE_UPDATE, { upcomingSongs: queue.upcomingSongs });
          socket.emit(EVENTS.DJ_MESSAGE, { text: `Queued: ${songs[0].name}` });
        }
      } catch (e) {
        socket.emit(EVENTS.ERROR, { code: 'SEARCH_FAILED', message: e.message });
      }
    });

    socket.on('location:update', ({ lat, lon }) => {
      if (lat && lon) setClientLocation(lat, lon);
    });

    socket.on('disconnect', () => {
      connectedClients = Math.max(0, connectedClients - 1);
      console.log(`[Socket] Client disconnected: ${socket.id} (remaining: ${connectedClients})`);
      // When all clients leave, stop music — next visitor gets a fresh cold start
      if (connectedClients === 0) {
        console.log('[Socket] All clients gone — stopping music for next session');
        scheduler.pause();
        scheduler.playhead.currentSong = null;
        scheduler.playhead.isPlaying = false;
        scheduler.coldStartState = 'pending';
      }
    });
  });

  // Recurring: sync time and queue
  setInterval(() => {
    io.emit(EVENTS.PLAYBACK_POSITION, scheduler.getPlaybackPosition());
    io.emit(EVENTS.SYNC_TIME, { serverTime: Date.now() });
  }, 5000);

  // Recurring: refill queue (with plan hints when available)
  setInterval(async () => {
    if (queue.needsMore(10)) {
      const cachedPlan = getPlan();
      await recommender.fillQueue(12, cachedPlan?.plan?.blocks || null);
      io.emit(EVENTS.QUEUE_UPDATE, { upcomingSongs: queue.upcomingSongs });
    }
  }, 30000);

  // Recurring: hourly mood check (Blueprint: 小时情绪检查)
  let lastMood = '';
  setInterval(async () => {
    const currentMood = getTimeOfDayMood();
    const hour = new Date().getHours();

    // 07:00 planning pulse, 09:00 morning refresh
    const shouldRefresh = (hour === 7 || hour === 9 || hour === 17 || hour === 22) && lastMood !== currentMood;

    if (shouldRefresh) {
      console.log(`[Scheduler] Mood shift: ${lastMood || 'init'} → ${currentMood}, refreshing...`);
      lastMood = currentMood;
      try {
        // Regenerate plan and refill queue with plan hints
        const newPlan = await generatePlan(true);
        io.emit(EVENTS.PLAN_UPDATE, newPlan);
        recommender.setPlanBlocks(newPlan.blocks);
        await recommender.fillQueue(15, newPlan.blocks);
        io.emit(EVENTS.QUEUE_UPDATE, { upcomingSongs: queue.upcomingSongs });
        io.emit(EVENTS.DJ_MESSAGE, {
          text: `The clock strikes ${hour}:00. Shifting the vibe for ${currentMood}...`,
        });
      } catch (e) {
        console.error('[Scheduler] Mood refresh failed:', e.message);
      }
    }
  }, 60000); // Check every minute, but only acts at specific hours

  // Recurring: proactive DJ speech check
  const proactiveEvents = new SocketEventPublisher(io);
  setInterval(async () => {
    try {
      await maybeProactiveSpeech({ events: proactiveEvents, scheduler, queue, getPlan });
    } catch (e) {
      console.error('[Proactive] Error:', e.message);
    }
  }, 60000);
}
