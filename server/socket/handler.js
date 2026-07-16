import { EVENTS } from './events.js';
import { ERROR_CODES } from '../domain/errors/error-codes.js';
import { wireQrLoginHandler } from './qrLoginHandler.js';
import {
  emitPlaybackResult,
  emitSongRequestResult,
  emitConversationResult,
  emitColdStartResult,
  emitStreamingConversationResult,
  emitAuthenticationResult,
  emitDjSpeechResult,
  emitPlanBlockResult,
  emitCrabInteractionResult,
  emitDashboardEvent,
  recordSongChange,
  recordDjSpeech,
} from './emitHelpers.js';
import { startRecurringTasks } from './recurringTasks.js';
import { wireProfileEvents } from './profileEvents.js';
import { onNewConnection } from './connectionHandler.js';
import { wireBubbleEvents, pushBubbles, maybePushBubbles } from './bubbleHandler.js';

// Logger is injected via deps parameter, not imported directly (D8 rule)
let logger = {
  info: (...args) => console.log('[handler]', ...args),
  warn: (...args) => console.warn('[handler]', ...args),
  error: (...args) => console.error('[handler]', ...args),
  debug: () => {},
  child: () => logger,
};

let preRecommendSnapshot = null; // { future: [...], current: {...} } for rejection rollback

// ─── Scheduler callbacks ─────────────────────────────────────────

function wireSchedulerCallbacks(io, deps) {
  const { scheduler, djSpeechService, getPlan, buildSongChangePayload, resetLastSpeechTime, metricsCollector } = deps;

  scheduler.onSongChange = async (song) => {
    recordSongChange(metricsCollector, deps.queue);
    try {
      // Send song info immediately (without audio URL) so client can update UI
      io.emit(EVENTS.SONG_CHANGE, buildSongChangePayload(song, scheduler.playhead.startedAt, null));
      emitDashboardEvent(io, 'song_change', (song?.artist || '?') + ' - ' + (song?.name || song?.title || '?'));

      // Fetch audio URL asynchronously and补发 via RADIO_STATE
      const audioUrl = await scheduler.getAudioUrl(song);
      if (audioUrl) {
        io.emit(EVENTS.RADIO_STATE, { ...scheduler.getState(), audioUrl });
      }

      // Probabilistically push bubbles on song change (55% chance)
      maybePushBubbles(io, deps);
    } catch (e) {
      logger.error({ component: 'scheduler', err: e }, 'onSongChange error');
    }
  };

  scheduler.onDjSpeechNeeded = async (prevSong, nextSong, transitionId) => {
    recordDjSpeech(metricsCollector, nextSong);
    emitDashboardEvent(io, 'dj_speech', nextSong ? 'Transition speech' : 'Refill speech');
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
        if (!speechHandled) {
          scheduler.speechComplete();
        }
        return;
      }

      const transitionResult = await djSpeechService.handleTransitionSpeech({ prevSong, nextSong, transitionId });
      emitDjSpeechResult(io, transitionResult, resetLastSpeechTime);
      speechHandled = transitionResult?.speechHandled === true;
      if (!speechHandled) {
        // Speech was skipped or stale — advance scheduler immediately instead of waiting for timeout
        scheduler.speechComplete();
      }
    } catch (err) {
      logger.error({ component: 'scheduler', err }, 'onDjSpeechNeeded error');
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
            logger.info({ component: 'cold-start' }, 'safety timeout - starting music');
            emitColdStartResult(io, safetyResult);
          }
        }, 30000);
      }

      // Cold-start bubble: push bubbles 8s after music starts
      setTimeout(() => pushBubbles(io, deps), 8000);
    } else { throw new Error('Cold open returned empty text'); }
  } catch (e) {
    logger.warn({ component: 'cold-start', err: e }, 'cold start failed, starting music directly');
    emitColdStartResult(io, await coldStartService.startMusicDirectly());

    // Cold-start bubble (fallback path): push bubbles 8s after direct music start
    setTimeout(() => pushBubbles(io, deps), 8000);
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
  }).catch(e => console.warn('[Handler] Proactive speech failed (degraded):', e.message));
}

function logChatRoute(routing) {
  const r = routing || {};
  logger.info({ component: 'chat', route: r.route, action: r.action, params: r.params }, 'route result');
}

function emitChatTurnResults(io, socket, turnResult) {
  for (const result of turnResult.conversationResults || []) {
    emitConversationResult(io, socket, result);
  }
  if (turnResult.queueUpdate) io.emit(EVENTS.QUEUE_UPDATE, turnResult.queueUpdate);
}

async function handleChatMessage(text, io, socket, deps) {
  const { agentLoopService, streamingConversationService, llmAdapter, metricsCollector } = deps;
  logger.info({ component: 'chat', text: text?.slice(0, 80) }, 'received');
  logger.debug({ component: 'chat', configured: llmAdapter.isConfigured() }, 'DJ configured');
  emitDashboardEvent(io, 'user_chat', (text || '').slice(0, 60));

  if (metricsCollector) metricsCollector.chatMessages.inc({ role: 'user' });

  const turnResult = await agentLoopService.handleMessage({ text, snapshot: preRecommendSnapshot });
  if (turnResult.unavailableMessage) {
    socket.emit(EVENTS.DJ_MESSAGE, turnResult.unavailableMessage);
    preRecommendSnapshot = turnResult.snapshot;
    return;
  }

  logChatRoute(turnResult.routing);
  emitChatTurnResults(io, socket, turnResult);
  preRecommendSnapshot = turnResult.snapshot;
  if ((turnResult.handled || !turnResult.streamRequest) && !turnResult.mergedStream) return;

  const streamingResult = await streamingConversationService.streamReply({
    ...turnResult.streamRequest,
    mergedStream: turnResult.mergedStream || null,
    onChunk: payload => socket.emit(EVENTS.DJ_STREAM_CHUNK, payload),
  });
  if (streamingResult.streamError) {
    logger.error({ component: 'chat', err: streamingResult.streamError }, 'stream error');
  }
  emitStreamingConversationResult(socket, streamingResult);
  startChatAnnouncement(io, streamingResult, deps);
}

// ─── Socket event wiring ─────────────────────────────────────────

function wireClientReady(socket, io, deps) {
  socket.on('client:ready', () => {
    logger.info({ component: 'socket', socketId: socket.id }, 'client ready - triggering cold start');
    triggerColdStart(io, deps);
  });
}

function wireAuthEvents(socket, deps) {
  const { authenticationService } = deps;

  // Clean up QR polling on disconnect — registered ONCE per socket, not per QR attempt
  socket.on('disconnect', () => {
    if (socket._qrPollInterval) {
      clearInterval(socket._qrPollInterval);
      socket._qrPollInterval = null;
    }
  });

  socket.on(EVENTS.AUTH_LOGIN_PHONE, async ({ phone, password }) => {
    try {
      // Retry on transient connection errors (not on auth failures like wrong password)
      let result = null;
      let lastError = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          result = await authenticationService.loginWithPhone({ phone, password });
          break;
        } catch (e) {
          lastError = e;
          if (e.isAuthError) break; // Don't retry wrong password
        if (attempt < 2) await new Promise(r => setTimeout(r, 500));
        }
      }
      if (!result) throw lastError;
      emitAuthenticationResult(socket, result);
    } catch (e) {
      socket.emit(EVENTS.ERROR, { code: ERROR_CODES.AUTH_LOGIN_FAILED, message: e.message });
    }
  });

  // QR login handled by extracted module (single-responsibility)
  wireQrLoginHandler(socket, authenticationService, emitAuthenticationResult);
}

function wirePlayerControls(socket, io, deps) {
  const { playbackService, queue, metricsCollector } = deps;

  socket.on('player:skip-to-index', async ({ index }) => {
    emitPlaybackResult(io, await playbackService.skipToIndex(index));
  });

  socket.on(EVENTS.PLAYER_SKIP, async () => {
    if (metricsCollector) metricsCollector.songSkips.inc();
    const result = await playbackService.skip();
    emitPlaybackResult(io, result);
    if (metricsCollector) metricsCollector.queueSize.set(queue.length);
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
  const { clientLifecycleService, metricsCollector } = deps;

  socket.on('disconnect', () => {
    const remaining = deps.getConnectedClients() - 1;
    deps.setConnectedClients(remaining);
    logger.info({ component: 'socket', socketId: socket.id, remaining }, 'client disconnected');
    if (metricsCollector) metricsCollector.connectedClients.set(remaining);
    const result = clientLifecycleService.handleDisconnect(remaining);
    if (result.stoppedMusic) {
      logger.info({ component: 'socket' }, 'all clients gone - stopping music');
    }
  });
}

// ─── Recurring tasks (extracted to recurringTasks.js) ────────────

// ─── Entry point ─────────────────────────────────────────────────

export function setupSocketHandler(io, services) {
  const deps = { ...services };
  // Inject logger from services into module scope
  if (deps.logger) logger = deps.logger;
  let connectedClients = 0;
  deps.getConnectedClients = () => connectedClients;
  deps.setConnectedClients = n => { connectedClients = Math.max(0, n); };

  wireSchedulerCallbacks(io, deps);
  deps.queue.init();

  io.on('connection', async (socket) => {
    // Register all event handlers FIRST (synchronous, non-blocking).
    // This ensures auth/login events are listening before any async
    // work in onNewConnection (e.g. getAudioUrl) which can delay
    // event registration and cause client login failures.
    wireClientReady(socket, io, deps);
    wireAuthEvents(socket, deps);
    wirePlayerControls(socket, io, deps);
    wireChatAndCrabEvents(socket, io, deps);
    wireSpeechAndPlanEvents(socket, io, deps);
    wireLifecycleEvents(socket, io, deps);

    // Bubble events + periodic bubble push
    const cleanupBubbles = wireBubbleEvents(io, socket, deps);
    socket.on('disconnect', () => { if (cleanupBubbles) cleanupBubbles(); });

    // Then do async connection work (may involve network calls).
    await onNewConnection(io, socket, deps);
  });

  startRecurringTasks(io, deps);
  wireProfileEvents(io, deps);
}
