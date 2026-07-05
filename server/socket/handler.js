import { EVENTS } from './events.js';
import { queue } from '../services/queue.js';
import { scheduler } from '../services/scheduler.js';
import { recommender } from '../services/recommender.js';
import { chatWithDj, isConfigured as isDjConfigured } from '../services/claude.js';
import { routeIntent } from '../services/router.js';
import { assemblePrompt, getTimeOfDayMood } from '../services/context.js';
import { isTtsAvailable } from '../services/tts.js';
import { generatePlan, isPlanStale, getPlan } from '../services/planner.js';
import { maybeProactiveSpeech, resetLastSpeechTime, setLastUserChat, setProactiveEnabled } from '../services/proactive.js';
import { SocketEventPublisher } from './SocketEventPublisher.js';
import { buildSongChangePayload } from '../domain/curation/buildSongChangePayload.js';
import { legacyWeatherAdapter } from '../infrastructure/environment/LegacyWeatherAdapter.js';
import { legacySpeechSynthAdapter } from '../infrastructure/speech/LegacySpeechSynthAdapter.js';
import { legacyNeteaseMusicSourceAdapter } from '../infrastructure/music/LegacyNeteaseMusicSourceAdapter.js';
import { legacyColdOpenWriter } from '../infrastructure/llm/LegacyColdOpenWriter.js';
import { legacyDjSpeechWriter } from '../infrastructure/llm/LegacyDjSpeechWriter.js';
import { legacyNeteaseAuthClient } from '../infrastructure/auth/LegacyNeteaseAuthClient.js';
import { createPlaybackService } from '../application/services/PlaybackService.js';
import { legacyChatHistoryRepository } from '../infrastructure/persistence/repositories/LegacyChatHistoryRepository.js';
import { legacyListenerProfileRepository } from '../infrastructure/persistence/repositories/LegacyListenerProfileRepository.js';
import { createConversationService } from '../application/services/ConversationService.js';
import { createColdStartService } from '../application/services/ColdStartService.js';
import { createStreamingConversationService } from '../application/services/StreamingConversationService.js';
import { createAuthenticationService } from '../application/services/AuthenticationService.js';
import { createDjSpeechService } from '../application/services/DjSpeechService.js';

let preRecommendSnapshot = null; // { future: [...], current: {...} } for rejection rollback

const playbackService = createPlaybackService({
  queue,
  scheduler,
  recommender,
  music: legacyNeteaseMusicSourceAdapter,
  getPlan,
});

const repositories = {
  chatHistory: legacyChatHistoryRepository,
  profile: legacyListenerProfileRepository,
};

const conversationService = createConversationService({
  queue,
  scheduler,
  recommender,
  repositories,
  music: legacyNeteaseMusicSourceAdapter,
  planner: {
    generatePlan,
    getPlan,
  },
});

const coldStartService = createColdStartService({
  queue,
  scheduler,
  speech: legacySpeechSynthAdapter,
  ttsAvailability: isTtsAvailable,
  weather: legacyWeatherAdapter,
  timeOfDay: getTimeOfDayMood,
  introWriter: legacyColdOpenWriter,
});

const streamingConversationService = createStreamingConversationService({
  chatWithDj,
  chatHistory: repositories.chatHistory,
  speech: legacySpeechSynthAdapter,
  ttsAvailability: isTtsAvailable,
});

const authenticationService = createAuthenticationService({
  authClient: legacyNeteaseAuthClient,
  recommender,
  queue,
  scheduler,
});

const djSpeechService = createDjSpeechService({
  scheduler,
  recommender,
  queueStore: queue,
  transitionWriter: legacyDjSpeechWriter,
  refillWriter: legacyDjSpeechWriter,
  weather: legacyWeatherAdapter,
  timeOfDay: getTimeOfDayMood,
  promptBuilder: assemblePrompt,
  speech: legacySpeechSynthAdapter,
  ttsAvailability: isTtsAvailable,
});

function emitPlaybackResult(io, result) {
  if (!result) return;
  if (result.state) io.emit(EVENTS.RADIO_STATE, result.state);
  if (result.queueUpdate) io.emit(EVENTS.QUEUE_UPDATE, result.queueUpdate);
  if (result.playbackPosition) io.emit(EVENTS.PLAYBACK_POSITION, result.playbackPosition);
  if (result.crabAnimation) io.emit(EVENTS.CRAB_ANIMATION, result.crabAnimation);
  if (result.resume) io.emit(EVENTS.RESUME, result.resume);
}

function emitSongRequestResult(io, socket, result) {
  if (!result) return;
  if (result.queueUpdate) io.emit(EVENTS.QUEUE_UPDATE, result.queueUpdate);
  if (result.djMessage) socket.emit(EVENTS.DJ_MESSAGE, result.djMessage);
  if (result.error) socket.emit(EVENTS.ERROR, result.error);
}

function emitConversationResult(io, socket, result) {
  if (!result) return;
  if (result.state) io.emit(EVENTS.RADIO_STATE, result.state);
  if (result.pause) io.emit(EVENTS.PAUSE);
  if (result.resume) io.emit(EVENTS.RESUME, result.resume);
  if (result.toClient?.state) socket.emit(EVENTS.RADIO_STATE, result.toClient.state);
  if (result.queueUpdate) io.emit(EVENTS.QUEUE_UPDATE, result.queueUpdate);
  if (result.planUpdate) io.emit(EVENTS.PLAN_UPDATE, result.planUpdate);
}

function emitColdStartResult(io, result) {
  if (!result) return;
  if (result.speechStart) io.emit(EVENTS.DJ_SPEECH_START, result.speechStart);
  if (result.textOnlyPhase) io.emit('cold-start:phase', result.textOnlyPhase);
  if (result.radioState) io.emit(EVENTS.RADIO_STATE, result.radioState);
  if (result.queueUpdate) io.emit(EVENTS.QUEUE_UPDATE, result.queueUpdate);
}

function emitStreamingConversationResult(socket, result) {
  if (!result) return;
  if (result.unavailableMessage) socket.emit(EVENTS.DJ_MESSAGE, result.unavailableMessage);
  if (result.streamEnd) socket.emit(EVENTS.DJ_STREAM_END, result.streamEnd);
}

function emitAuthenticationResult(socket, result) {
  if (!result) return;
  if (result.loginSuccess) socket.emit('auth:login-success', result.loginSuccess);
  if (result.qrCreated) socket.emit('auth:qr-created', result.qrCreated);
  if (result.qrStatus) socket.emit('auth:qr-status', result.qrStatus);
  if (result.qrExpired) socket.emit('auth:qr-expired');
  if (result.queueUpdate) socket.emit(EVENTS.QUEUE_UPDATE, result.queueUpdate);
}

function emitDjSpeechResult(io, result) {
  if (!result) return;
  if (result.queueUpdate) io.emit(EVENTS.QUEUE_UPDATE, result.queueUpdate);
  if (result.djMessage) io.emit(EVENTS.DJ_MESSAGE, { ...result.djMessage, timestamp: Date.now() });
  if (result.speechStart) {
    io.emit(EVENTS.DJ_SPEECH_START, result.speechStart);
    if (result.resetLastSpeechTime) resetLastSpeechTime();
  }
}

function startChatAnnouncement(io, result) {
  if (!result?.speechAnnouncement) return;
  streamingConversationService.synthesizeAnnouncement(result.speechAnnouncement).then(speechStart => {
    if (speechStart) {
      io.emit(EVENTS.DJ_SPEECH_START, speechStart);
      resetLastSpeechTime();
    }
  }).catch(() => {});
}

export function setupSocketHandler(io) {
  let connectedClients = 0;

  // Wire up scheduler callbacks
  scheduler.onSongChange = async (song) => {
    try {
      const audioUrl = await scheduler.getAudioUrl(song);
      console.log('[Scheduler] onSongChange:', song?.name || song?.title, '| audioUrl:', audioUrl ? 'YES' : 'NULL');
      io.emit(EVENTS.SONG_CHANGE, buildSongChangePayload(song, scheduler.playhead.startedAt, audioUrl));
    } catch (e) {
      console.error('[Scheduler] onSongChange error:', e.message);
    }
  };

  scheduler.onDjSpeechNeeded = async (prevSong, nextSong, transitionId) => {
    let speechHandled = false;
    try {
      if (!nextSong) {
        const cachedPlan = getPlan();
        const refillResult = await djSpeechService.handleRefillSpeech({
          transitionId,
          planBlocks: cachedPlan?.plan?.blocks || null,
        });
        emitDjSpeechResult(io, refillResult);
        speechHandled = refillResult?.speechHandled === true;
        return;
      }

      const transitionResult = await djSpeechService.handleTransitionSpeech({ prevSong, nextSong, transitionId });
      emitDjSpeechResult(io, transitionResult);
      speechHandled = transitionResult?.speechHandled === true;
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
    socket.emit('tts:status', legacySpeechSynthAdapter.health());

    // === Cold Start (triggered by client:ready) ===
    async function triggerColdStart() {
      const start = coldStartService.beginIfReady();
      if (!start.shouldStart) return;
      const firstSong = start.firstSong;
      try {
        const intro = await coldStartService.writeIntro({
          firstSong,
          onPhase: payload => io.emit('cold-start:phase', payload),
          onChunk: payload => io.emit(EVENTS.DJ_STREAM_CHUNK, payload),
        });
        io.emit(EVENTS.DJ_STREAM_END, intro.streamEnd);
        const { fullText } = intro;

        if (fullText) {
          io.emit(EVENTS.DJ_MESSAGE, { text: fullText, timestamp: Date.now() });

          // Phase 2: generating TTS
          io.emit('cold-start:phase', { phase: 'speaking' });

          const coldStartResult = await coldStartService.handleGeneratedIntro({ fullText });
          emitColdStartResult(io, coldStartResult);
          if (coldStartResult.speechStart) {
            // Safety timeout: if speech never ends, start music anyway
            setTimeout(async () => {
              const safetyResult = await coldStartService.startMusicIfStillInProgress();
              if (safetyResult) {
                console.log('[Socket] Cold start safety timeout — starting music');
                emitColdStartResult(io, safetyResult);
              }
            }, 30000);
          }
        } else { throw new Error('Cold open returned empty text'); }
      } catch (e) {
        console.log('[Socket] Cold start failed (' + e.message + '), starting music directly');
        emitColdStartResult(io, await coldStartService.startMusicDirectly());
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
        emitAuthenticationResult(socket, await authenticationService.loginWithPhone({ phone, password }));
      } catch (e) {
        socket.emit(EVENTS.ERROR, { code: 'AUTH_FAILED', message: e.message });
      }
    });

    socket.on(EVENTS.AUTH_LOGIN_QR_START, async () => {
      try {
        const qrResult = await authenticationService.createQrLogin();
        emitAuthenticationResult(socket, qrResult);
        const key = qrResult.qrCreated.key;

        // Poll for QR scan
        const pollInterval = setInterval(async () => {
          try {
            const result = await authenticationService.checkQrLogin(key);
            emitAuthenticationResult(socket, result);
            if (result.done) {
              clearInterval(pollInterval);
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
      emitPlaybackResult(io, await playbackService.skipToIndex(index));
    });

    socket.on(EVENTS.PLAYER_SKIP, async () => {
      const result = await playbackService.skip();
      emitPlaybackResult(io, result);
      result?.refill?.then(() => {
        io.emit(EVENTS.QUEUE_UPDATE, { upcomingSongs: queue.upcomingSongs, mode: queue.mode });
      });
    });

    socket.on(EVENTS.PLAYER_PREVIOUS, async () => {
      emitPlaybackResult(io, await playbackService.previous());
    });

    socket.on(EVENTS.PLAYER_PAUSE, () => {
      const result = playbackService.pause();
      io.emit(EVENTS.PAUSE);
      emitPlaybackResult(io, result);
    });

    socket.on(EVENTS.PLAYER_RESUME, () => {
      emitPlaybackResult(io, playbackService.resume());
    });

    socket.on(EVENTS.PLAYER_SET_MODE, ({ mode }) => {
      emitPlaybackResult(io, playbackService.setMode(mode));
    });

    socket.on(EVENTS.PLAYER_SEEK, ({ position }) => {
      emitPlaybackResult(io, playbackService.seek(position));
    });

    socket.on('player:ended', async () => {
      emitPlaybackResult(io, await playbackService.ended());
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

      const fastAction = await conversationService.handleFastAction(routing);
      emitConversationResult(io, socket, fastAction);
      if (fastAction.handled) return;
      if (fastAction.snapshot) preRecommendSnapshot = fastAction.snapshot;
      if (fastAction.toolResults) {
        toolResults = fastAction.toolResults;
      }

      const planAction = await conversationService.handlePlanAction({ routing, text });
      emitConversationResult(io, socket, planAction);
      if (planAction.toolResults) {
        toolResults = planAction.toolResults;
      }

      // Clear snapshot on non-rejection messages (user has moved on)
      preRecommendSnapshot = conversationService.nextSnapshot(routing, preRecommendSnapshot);

      // === Personalized recommendation (uses full recommender pipeline) ===
      if (routing.action === 'play_personalized') {
        const result = await conversationService.handlePersonalizedRecommendation(routing);
        preRecommendSnapshot = result.snapshot;
        if (result.queueUpdate) io.emit(EVENTS.QUEUE_UPDATE, result.queueUpdate);
        if (result.toolResults) toolResults = result.toolResults;
      }

      if (['reject_recommend', 'recommend_rollback', 'recommend_retry'].includes(routing.action)) {
        const result = await conversationService.handleRecommendationAction({
          routing,
          snapshot: preRecommendSnapshot,
        });
        if (result.snapshot !== undefined) preRecommendSnapshot = result.snapshot;
        if (result.queueUpdate) io.emit(EVENTS.QUEUE_UPDATE, result.queueUpdate);
        if (result.toolResults) toolResults = result.toolResults;
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
      const weather = await legacyWeatherAdapter.current();
      const contextPrompt = assemblePrompt({
        userInput: text,
        toolResults,
        environment: { weather },
        execTrace: { lastAction: routing.action, queueLength: queue.length, mode: queue.mode },
      });

      const messageId = Date.now().toString();
      const streamingResult = await streamingConversationService.streamReply({
        text,
        contextPrompt,
        routing,
        messageId,
        onChunk: payload => socket.emit(EVENTS.DJ_STREAM_CHUNK, payload),
      });
      if (streamingResult.streamError) {
        console.error('[Socket] Stream error:', streamingResult.streamError.message);
      }
      emitStreamingConversationResult(socket, streamingResult);
      startChatAnnouncement(io, streamingResult);
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
      emitSongRequestResult(io, socket, await playbackService.requestSong(query));
    });

    socket.on('location:update', ({ lat, lon }) => {
      if (lat && lon) legacyWeatherAdapter.setClientLocation(lat, lon);
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
