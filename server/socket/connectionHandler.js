/**
 * New connection handler — sends initial state to a freshly connected client.
 * Extracted from handler.js for single-responsibility.
 */
import { EVENTS } from './events.js';

/**
 * Handle a new socket connection: count clients, reset for fresh session
 * on first client, and emit current radio/plan/TTS state.
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 * @param {object} deps — service dependencies
 * @param {object} deps.logger — pino-style logger
 */
export async function onNewConnection(io, socket, deps) {
  const { scheduler, getPlan, speechSynthAdapter, metricsCollector, logger } = deps;
  const count = deps.getConnectedClients() + 1;
  deps.setConnectedClients(count);
  logger?.info?.({ component: 'socket', socketId: socket.id, total: count }, 'client connected');
  if (metricsCollector) metricsCollector.connectedClients.set(count);

  if (count === 1) {
    logger?.info?.({ component: 'socket' }, 'first client - resetting for fresh session');
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
