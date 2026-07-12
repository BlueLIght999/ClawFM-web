import { EVENTS } from './events.js';

let preRecommendSnapshot = null; // { future: [...], current: {...} } for rejection rollback

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

function emitDjSpeechResult(io, result, resetLastSpeechTime) {
  if (!result) return;
  if (result.queueUpdate) io.emit(EVENTS.QUEUE_UPDATE, result.queueUpdate);
  if (result.djMessage) io.emit(EVENTS.DJ_MESSAGE, { ...result.djMessage, timestamp: Date.now() });
  if (result.speechStart) {
    io.emit(EVENTS.DJ_SPEECH_START, result.speechStart);
  }
  if (result.resetLastSpeechTime) resetLastSpeechTime();
}

function emitPlanBlockResult(io, result) {
  if (!result) return;
  if (result.queueUpdate) io.emit(EVENTS.QUEUE_UPDATE, result.queueUpdate);
  if (result.planUpdate) io.emit(EVENTS.PLAN_UPDATE, result.planUpdate);
}

function emitCrabInteractionResult(io, result) {
  if (!result) return;
  if (result.radioState) io.emit(EVENTS.RADIO_STATE, result.radioState);
  if (result.animation) io.emit(EVENTS.CRAB_ANIMATION, result.animation);
  if (result.delayedAnimation) {
    setTimeout(() => io.emit(EVENTS.CRAB_ANIMATION, result.delayedAnimation.animation), result.delayedAnimation.delayMs);
  }
}

// ─── Scheduler callbacks ─────────────────────────────────────────

function wireSchedulerCallbacks(io, deps) {
  const { scheduler, djSpeechService, getPlan, buildSongChangePayload, resetLastSpeechTime } = deps;

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
        emitDjSpeechResult(io, refillResult, resetLastSpeechTime);
        speechHandled = refillResult?.speechHandled === true;
        return;
      }

      const transitionResult = await djSpeechService.handleTransitionSpeech({ prevSong, nextSong, transitionId });
      emitDjSpeechResult(io, transitionResult, resetLastSpeechTime);
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
}

// ─── Cold start ──────────────────────────────────────────────────

async function triggerColdStart(io, deps) {
  const { coldStartService } = deps;
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
      io.emit('cold-start:phase', { phase: 'speaking' });

      const coldStartResult = await coldStartService.handleGeneratedIntro({ fullText });
      emitColdStartResult(io, coldStartResult);
      if (coldStartResult.speechStart) {
        setTimeout(async () => {
          const safetyResult = await coldStartService.startMusicIfStillInProgress();
          if (safetyResult) {
            console.log('[Socket] Cold start safety timeout - starting music');
            emitColdStartResult(io, safetyResult);
          }
        }, 30000);
      }
    } else { throw new Error('Cold open returned empty text'); }
  } catch (e) {
    console.log(`[Socket] Cold start failed (${e.message}), starting music directly`);
    emitColdStartResult(io, await coldStartService.startMusicDirectly());
  }
}

// ─── Chat ────────────────────────────────────────────────────────

function startChatAnnouncement(io, result, deps) {
  if (!result?.speechAnnouncement) return;
  const { streamingConversationService, resetLastSpeechTime } = deps;
  streamingConversationService.synthesizeAnnouncement(result.speechAnnouncement).then(speechStart => {
    if (speechStart) {
      io.emit(EVENTS.DJ_SPEECH_START, speechStart);
      resetLastSpeechTime();
    }
  }).catch(() => {});
}

function logChatRoute(routing) {
  const r = routing || {};
  console.log('[Chat] Route result:', r.route, r.action, r.params);
}

function emitChatTurnResults(io, socket, turnResult) {
  for (const result of turnResult.conversationResults || []) {
    emitConversationResult(io, socket, result);
  }
  if (turnResult.queueUpdate) io.emit(EVENTS.QUEUE_UPDATE, turnResult.queueUpdate);
}

async function handleChatMessage(text, io, socket, deps) {
  const { agentTurnService, streamingConversationService, llmAdapter } = deps;
  console.log('[Chat] Received:', text?.slice(0, 80));
  console.log('[Chat] DJ configured:', llmAdapter.isConfigured());

  const turnResult = await agentTurnService.handleMessage({ text, snapshot: preRecommendSnapshot });
  if (turnResult.unavailableMessage) {
    socket.emit(EVENTS.DJ_MESSAGE, turnResult.unavailableMessage);
    preRecommendSnapshot = turnResult.snapshot;
    return;
  }

  logChatRoute(turnResult.routing);
  emitChatTurnResults(io, socket, turnResult);
  preRecommendSnapshot = turnResult.snapshot;
  if (turnResult.handled || !turnResult.streamRequest) return;

  const streamingResult = await streamingConversationService.streamReply({
    ...turnResult.streamRequest,
    onChunk: payload => socket.emit(EVENTS.DJ_STREAM_CHUNK, payload),
  });
  if (streamingResult.streamError) {
    console.error('[Socket] Stream error:', streamingResult.streamError.message);
  }
  emitStreamingConversationResult(socket, streamingResult);
  startChatAnnouncement(io, streamingResult, deps);
}

// ─── Connection handler ──────────────────────────────────────────

async function onNewConnection(io, socket, deps) {
  const { scheduler, getPlan, speechSynthAdapter } = deps;
  const count = deps.getConnectedClients() + 1;
  deps.setConnectedClients(count);
  console.log(`[Socket] Client connected: ${socket.id} (total: ${count})`);

  if (count === 1) {
    console.log('[Socket] First client - resetting for fresh session');
    scheduler.coldStartState = 'pending';
    if (scheduler.isPlaying) {
      scheduler.pause();
      scheduler.playhead.currentSong = null;
      scheduler.playhead.isPlaying = false;
    }
  }

  const state = scheduler.getState();
  if (state.currentSong && !state.audioUrl) {
    const url = await scheduler.getAudioUrl(state.currentSong);
    if (url) state.audioUrl = url;
  }
  socket.emit(EVENTS.RADIO_STATE, state);

  const currentPlan = getPlan();
  if (currentPlan) socket.emit(EVENTS.PLAN_UPDATE, currentPlan.plan);
  socket.emit('tts:status', speechSynthAdapter.health());
}

// ─── Socket event wiring ─────────────────────────────────────────

function wireClientReady(socket, io, deps) {
  socket.on('client:ready', () => {
    console.log(`[Socket] Client ${socket.id} ready - triggering cold start`);
    triggerColdStart(io, deps);
  });
}

function wireAuthEvents(socket, deps) {
  const { authenticationService } = deps;

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

      if (socket._qrPollInterval) clearInterval(socket._qrPollInterval);

      socket._qrPollInterval = setInterval(async () => {
        try {
          const result = await authenticationService.checkQrLogin(key);
          emitAuthenticationResult(socket, result);
          if (result.done) {
            clearInterval(socket._qrPollInterval);
            socket._qrPollInterval = null;
          }
        } catch { /* keep polling */ }
      }, 2000);

      socket.on('disconnect', () => {
        if (socket._qrPollInterval) {
          clearInterval(socket._qrPollInterval);
          socket._qrPollInterval = null;
        }
      });
    } catch (e) {
      socket.emit(EVENTS.ERROR, { code: 'QR_FAILED', message: e.message });
    }
  });
}

function wirePlayerControls(socket, io, deps) {
  const { playbackService, queue } = deps;

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
}

function wireChatAndCrabEvents(socket, io, deps) {
  socket.on(EVENTS.CHAT_MESSAGE, async ({ text }) => {
    await handleChatMessage(text, io, socket, deps);
  });

  socket.on(EVENTS.CRAB_CLICK, async ({ interaction }) => {
    emitCrabInteractionResult(io, await deps.crabInteractionService.handleInteraction(interaction));
  });
}

function wireSpeechAndPlanEvents(socket, io, deps) {
  const { speechCompletionService, planBlockService, playbackService,
    setProactiveEnabled, weatherAdapter } = deps;

  socket.on('dj-speech-finished', async (data) => {
    const result = await speechCompletionService.handleSpeechFinished(data);
    if (result.speechEnd) io.emit(EVENTS.DJ_SPEECH_END);
    if (result.crabAnimation) io.emit(EVENTS.CRAB_ANIMATION, result.crabAnimation);
    if (result.radioState) io.emit(EVENTS.RADIO_STATE, result.radioState);
    if (result.queueUpdate) io.emit(EVENTS.QUEUE_UPDATE, result.queueUpdate);
  });

  socket.on('plan:select-block', async ({ blockIndex }) => {
    emitPlanBlockResult(io, await planBlockService.selectBlock(blockIndex));
  });

  socket.on('plan:pin-block', async ({ blockIndex }) => {
    emitPlanBlockResult(io, await planBlockService.pinBlock(blockIndex));
  });

  socket.on('plan:clear-selection', async () => {
    emitPlanBlockResult(io, await planBlockService.clearSelection());
  });

  socket.on('proactive:toggle', ({ enabled }) => {
    setProactiveEnabled(enabled);
    socket.emit('proactive:state', { enabled });
  });

  socket.on(EVENTS.SONG_REQUEST, async ({ query }) => {
    emitSongRequestResult(io, socket, await playbackService.requestSong(query));
  });

  socket.on('location:update', ({ lat, lon }) => {
    if (lat && lon) weatherAdapter.setClientLocation(lat, lon);
  });
}

function wireLifecycleEvents(socket, io, deps) {
  const { clientLifecycleService } = deps;

  socket.on('disconnect', () => {
    const remaining = deps.getConnectedClients() - 1;
    deps.setConnectedClients(remaining);
    console.log(`[Socket] Client disconnected: ${socket.id} (remaining: ${remaining})`);
    const result = clientLifecycleService.handleDisconnect(remaining);
    if (result.stoppedMusic) {
      console.log('[Socket] All clients gone - stopping music for next session');
    }
  });
}

// ─── Recurring tasks ─────────────────────────────────────────────

function startRecurringTasks(io, deps) {
  const { scheduler, queue, recommender, getPlan, generatePlan,
    getTimeOfDayMood, maybeProactiveSpeech, eventPublisher } = deps;

  setInterval(() => {
    io.emit(EVENTS.PLAYBACK_POSITION, scheduler.getPlaybackPosition());
    io.emit(EVENTS.SYNC_TIME, { serverTime: Date.now() });
  }, 5000);

  setInterval(async () => {
    if (queue.needsMore(10)) {
      const cachedPlan = getPlan();
      await recommender.fillQueue(12, cachedPlan?.plan?.blocks || null);
      io.emit(EVENTS.QUEUE_UPDATE, { upcomingSongs: queue.upcomingSongs });
    }
  }, 30000);

  let lastMood = '';
  setInterval(async () => {
    const currentMood = getTimeOfDayMood();
    const hour = new Date().getHours();
    const shouldRefresh = (hour === 7 || hour === 9 || hour === 17 || hour === 22) && lastMood !== currentMood;

    if (shouldRefresh) {
      console.log(`[Scheduler] Mood shift: ${lastMood || 'init'} -> ${currentMood}, refreshing...`);
      lastMood = currentMood;
      try {
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
  }, 60000);

  setInterval(async () => {
    try {
      await maybeProactiveSpeech({ events: eventPublisher, scheduler, queue, getPlan });
    } catch (e) {
      console.error('[Proactive] Error:', e.message);
    }
  }, 60000);
}

// ─── Entry point ─────────────────────────────────────────────────

export function setupSocketHandler(io, services) {
  const deps = { ...services };
  let connectedClients = 0;
  deps.getConnectedClients = () => connectedClients;
  deps.setConnectedClients = n => { connectedClients = Math.max(0, n); };

  wireSchedulerCallbacks(io, deps);
  deps.queue.init();

  io.on('connection', async (socket) => {
    await onNewConnection(io, socket, deps);
    wireClientReady(socket, io, deps);
    wireAuthEvents(socket, deps);
    wirePlayerControls(socket, io, deps);
    wireChatAndCrabEvents(socket, io, deps);
    wireSpeechAndPlanEvents(socket, io, deps);
    wireLifecycleEvents(socket, io, deps);
  });

  startRecurringTasks(io, deps);
}
