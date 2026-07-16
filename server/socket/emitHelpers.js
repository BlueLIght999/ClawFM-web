/**
 * Socket emit helpers — pure IO translation from service results to socket events.
 * Extracted from handler.js for single-responsibility.
 */
import { EVENTS } from './events.js';

export function emitPlaybackResult(io, result) {
  if (!result) return;
  if (result.state) io.emit(EVENTS.RADIO_STATE, result.state);
  if (result.queueUpdate) io.emit(EVENTS.QUEUE_UPDATE, result.queueUpdate);
  if (result.playbackPosition) io.emit(EVENTS.PLAYBACK_POSITION, result.playbackPosition);
  if (result.crabAnimation) io.emit(EVENTS.CRAB_ANIMATION, result.crabAnimation);
  if (result.resume) io.emit(EVENTS.RESUME, result.resume);
}

export function emitSongRequestResult(io, socket, result) {
  if (!result) return;
  if (result.queueUpdate) io.emit(EVENTS.QUEUE_UPDATE, result.queueUpdate);
  if (result.djMessage) socket.emit(EVENTS.DJ_MESSAGE, result.djMessage);
  if (result.error) socket.emit(EVENTS.ERROR, result.error);
}

export function emitConversationResult(io, socket, result) {
  if (!result) return;
  if (result.state) io.emit(EVENTS.RADIO_STATE, result.state);
  if (result.pause) io.emit(EVENTS.PAUSE);
  if (result.resume) io.emit(EVENTS.RESUME, result.resume);
  if (result.toClient?.state) socket.emit(EVENTS.RADIO_STATE, result.toClient.state);
  if (result.queueUpdate) io.emit(EVENTS.QUEUE_UPDATE, result.queueUpdate);
  if (result.planUpdate) io.emit(EVENTS.PLAN_UPDATE, result.planUpdate);
}

export function emitColdStartResult(io, result) {
  if (!result) return;
  if (result.speechStart) io.emit(EVENTS.DJ_SPEECH_START, result.speechStart);
  if (result.textOnlyPhase) io.emit('cold-start:phase', result.textOnlyPhase);
  if (result.radioState) io.emit(EVENTS.RADIO_STATE, result.radioState);
  if (result.queueUpdate) io.emit(EVENTS.QUEUE_UPDATE, result.queueUpdate);
}

export function emitStreamingConversationResult(socket, result) {
  if (!result) return;
  if (result.unavailableMessage) socket.emit(EVENTS.DJ_MESSAGE, result.unavailableMessage);
  if (result.streamEnd) socket.emit(EVENTS.DJ_STREAM_END, result.streamEnd);
}

export function emitAuthenticationResult(socket, result) {
  if (!result) return;
  if (result.loginSuccess) socket.emit('auth:login-success', result.loginSuccess);
  if (result.qrCreated) socket.emit('auth:qr-created', result.qrCreated);
  if (result.qrStatus) socket.emit('auth:qr-status', result.qrStatus);
  if (result.qrExpired) socket.emit('auth:qr-expired');
  if (result.queueUpdate) socket.emit(EVENTS.QUEUE_UPDATE, result.queueUpdate);

  // Background queue fill: emit queueUpdate via socket when ready (non-blocking)
  if (result.fillQueuePromise) {
    result.fillQueuePromise
      .then(queueUpdate => {
        if (queueUpdate) socket.emit(EVENTS.QUEUE_UPDATE, queueUpdate);
      })
      .catch(() => {});
  }
}

export function emitDjSpeechResult(io, result, resetLastSpeechTime) {
  if (!result) return;
  if (result.queueUpdate) io.emit(EVENTS.QUEUE_UPDATE, result.queueUpdate);
  if (result.djMessage) io.emit(EVENTS.DJ_MESSAGE, { ...result.djMessage, timestamp: Date.now() });
  if (result.speechStart) {
    io.emit(EVENTS.DJ_SPEECH_START, result.speechStart);
  }
  if (result.resetLastSpeechTime) resetLastSpeechTime();
}

export function emitPlanBlockResult(io, result) {
  if (!result) return;
  if (result.queueUpdate) io.emit(EVENTS.QUEUE_UPDATE, result.queueUpdate);
  if (result.planUpdate) io.emit(EVENTS.PLAN_UPDATE, result.planUpdate);
}

export function emitCrabInteractionResult(io, result) {
  if (!result) return;
  if (result.radioState) io.emit(EVENTS.RADIO_STATE, result.radioState);
  if (result.animation) io.emit(EVENTS.CRAB_ANIMATION, result.animation);
  if (result.delayedAnimation) {
    setTimeout(() => io.emit(EVENTS.CRAB_ANIMATION, result.delayedAnimation.animation), result.delayedAnimation.delayMs);
  }
}

export function emitDashboardEvent(io, type, message) {
  io.of('/dashboard').emit('dashboard:event', { type, message, timestamp: Date.now() });
}

export function recordSongChange(metricsCollector, queue) {
  if (!metricsCollector) return;
  metricsCollector.songsPlayed.inc();
  metricsCollector.queueSize.set(queue.length);
}

export function recordDjSpeech(metricsCollector, nextSong) {
  if (!metricsCollector) return;
  metricsCollector.djSpeech.inc({ type: nextSong ? 'transition' : 'refill' });
}
