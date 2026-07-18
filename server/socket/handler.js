/**
 * Socket handler — thin orchestration layer.
 *
 * Cold start extracted to socket/coldStartHandler.js
 * Chat handling extracted to socket/chatHandler.js
 *
 * This file now only:
 *   1. Wires scheduler callbacks (onSongChange / onDjSpeechNeeded / onStateChange)
 *   2. Wires socket events (client:ready / auth / player / chat / speech / lifecycle)
 *   3. Delegates to extracted modules for cold start and chat
 */

import { EVENTS } from './events.js';
import { ERROR_CODES } from '../domain/errors/error-codes.js';
import { wireQrLoginHandler } from './qrLoginHandler.js';
import {
  emitPlaybackResult,
  emitSongRequestResult,
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
import { wireBubbleEvents, maybePushBubbles } from './bubbleHandler.js';
import { triggerColdStart } from './coldStartHandler.js';
import { handleChatMessage, setChatLogger } from './chatHandler.js';
import { emitQueueUpdate, emitRadioState, emitSongChange } from './versionedRadioEmitter.js';
import { safeAsyncHandler } from '../domain/socket/safeAsyncHandler.js';

let logger = {
  info: (...args) => console.log('[handler]', ...args),
  warn: (...args) => console.warn('[handler]', ...args),
  error: (...args) => console.error('[handler]', ...args),
  debug: () => {},
  child: () => logger,
};

// ─── Scheduler callbacks ─────────────────────────────────────────

function wireSchedulerCallbacks(io, deps) {
  const { scheduler, djSpeechService, getPlan, buildSongChangePayload, resetLastSpeechTime, metricsCollector, chatHistory } = deps;

  scheduler.onSongChange = async (song) => {
    recordSongChange(metricsCollector, deps.queue);
    try {
      emitSongChange(io, buildSongChangePayload(song, scheduler.playhead.startedAt, null));
      emitDashboardEvent(io, 'song_change', `${song?.artist || '?'  } - ${  song?.name || song?.title || '?'}`);

      const audioUrl = await scheduler.getAudioUrl(song);
      if (audioUrl) {
        emitRadioState(io, { ...scheduler.getState(), audioUrl });
      } else {
        logger.warn({ component: 'scheduler', songId: song?.id, songName: song?.name }, 'getAudioUrl returned null — client will not receive audioUrl');
      }

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
        if (refillResult?.djMessage?.text && chatHistory) chatHistory.append('assistant', refillResult.djMessage.text);
        speechHandled = refillResult?.speechHandled === true;
        if (!speechHandled) scheduler.speechComplete();
        return;
      }

      const transitionResult = await djSpeechService.handleTransitionSpeech({ prevSong, nextSong, transitionId });
      emitDjSpeechResult(io, transitionResult, resetLastSpeechTime);
      if (transitionResult?.djMessage?.text && chatHistory) chatHistory.append('assistant', transitionResult.djMessage.text);
      speechHandled = transitionResult?.speechHandled === true;
      if (!speechHandled) scheduler.speechComplete();
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

// ─── Socket event wiring ─────────────────────────────────────────

function wireClientReady(socket, io, deps) {
  socket.on('client:ready', () => {
    logger.info({ component: 'socket', socketId: socket.id }, 'client ready - triggering cold start');
    triggerColdStart(io, deps);
  });
}

function wireAuthEvents(socket, deps) {
  const { authenticationService } = deps;

  socket.on('disconnect', () => {
    if (socket._qrPollInterval) {
      clearInterval(socket._qrPollInterval);
      socket._qrPollInterval = null;
    }
  });

  socket.on(EVENTS.AUTH_LOGIN_PHONE, async ({ phone, password }) => {
    try {
      let result = null;
      let lastError = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          result = await authenticationService.loginWithPhone({ phone, password });
          break;
        } catch (e) {
          lastError = e;
          if (e.isAuthError) break;
          if (attempt < 2) await new Promise(r => setTimeout(r, 500));
        }
      }
      if (!result) throw lastError;
      emitAuthenticationResult(socket, result);
    } catch (e) {
      socket.emit(EVENTS.ERROR, { code: ERROR_CODES.AUTH_LOGIN_FAILED, message: e.message });
    }
  });

  wireQrLoginHandler(socket, authenticationService, emitAuthenticationResult);
}

function wirePlayerControls(socket, io, deps) {
  const { playbackService, queue, metricsCollector } = deps;

  socket.on('player:skip-to-index', safeAsyncHandler(async ({ index }) => {
    emitPlaybackResult(io, await playbackService.skipToIndex(index));
  }));

  socket.on(EVENTS.PLAYER_SKIP, safeAsyncHandler(async () => {
    if (metricsCollector) metricsCollector.songSkips.inc();
    const result = await playbackService.skip();
    emitPlaybackResult(io, result);
    if (metricsCollector) metricsCollector.queueSize.set(queue.length);
    result?.refill?.then(() => {
      emitQueueUpdate(io, { upcomingSongs: queue.upcomingSongs, mode: queue.mode });
    });
  }));

  socket.on(EVENTS.PLAYER_PREVIOUS, safeAsyncHandler(async () => {
    emitPlaybackResult(io, await playbackService.previous());
  }));

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

  socket.on('player:ended', safeAsyncHandler(async () => {
    emitPlaybackResult(io, await playbackService.ended());
  }));
}

function wireChatAndCrabEvents(socket, io, deps) {
  socket.on(EVENTS.CHAT_MESSAGE, safeAsyncHandler(async ({ text }) => {
    await handleChatMessage(text, io, socket, deps);
  }));

  socket.on(EVENTS.CRAB_CLICK, safeAsyncHandler(async ({ interaction }) => {
    emitCrabInteractionResult(io, await deps.crabInteractionService.handleInteraction(interaction));
  }));
}

function wireSpeechAndPlanEvents(socket, io, deps) {
  const { speechCompletionService, planBlockService, playbackService,
    setProactiveEnabled, weatherAdapter } = deps;

  socket.on('dj-speech-finished', safeAsyncHandler(async (data) => {
    const result = await speechCompletionService.handleSpeechFinished(data);
    if (result.speechEnd) io.emit(EVENTS.DJ_SPEECH_END);
    if (result.crabAnimation) io.emit(EVENTS.CRAB_ANIMATION, result.crabAnimation);
    if (result.radioState) emitRadioState(io, result.radioState);
    if (result.queueUpdate) emitQueueUpdate(io, result.queueUpdate);
  }));

  socket.on('plan:select-block', safeAsyncHandler(async ({ blockIndex }) => {
    emitPlanBlockResult(io, await planBlockService.selectBlock(blockIndex));
  }));

  socket.on('plan:pin-block', safeAsyncHandler(async ({ blockIndex }) => {
    emitPlanBlockResult(io, await planBlockService.pinBlock(blockIndex));
  }));

  socket.on('plan:clear-selection', safeAsyncHandler(async () => {
    emitPlanBlockResult(io, await planBlockService.clearSelection());
  }));

  socket.on('proactive:toggle', ({ enabled }) => {
    setProactiveEnabled(enabled);
    socket.emit('proactive:state', { enabled });
  });

  socket.on(EVENTS.SONG_REQUEST, safeAsyncHandler(async ({ query }) => {
    emitSongRequestResult(io, socket, await playbackService.requestSong(query));
  }));

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

// ─── Entry point ─────────────────────────────────────────────────

export function setupSocketHandler(io, services) {
  const deps = { ...services };
  if (deps.logger) {
    logger = deps.logger;
    setChatLogger(logger);
  }
  let connectedClients = 0;
  deps.getConnectedClients = () => connectedClients;
  deps.setConnectedClients = n => { connectedClients = Math.max(0, n); };

  wireSchedulerCallbacks(io, deps);
  deps.queue.init();

  io.on('connection', async (socket) => {
    wireClientReady(socket, io, deps);
    wireAuthEvents(socket, deps);
    wirePlayerControls(socket, io, deps);
    wireChatAndCrabEvents(socket, io, deps);
    wireSpeechAndPlanEvents(socket, io, deps);
    wireLifecycleEvents(socket, io, deps);

    const cleanupBubbles = wireBubbleEvents(io, socket, deps);
    socket.on('disconnect', () => { if (cleanupBubbles) cleanupBubbles(); });

    await onNewConnection(io, socket, deps);
  });

  startRecurringTasks(io, deps);
  wireProfileEvents(io, deps);
}
