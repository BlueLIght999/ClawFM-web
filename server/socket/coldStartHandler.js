/**
 * ColdStartHandler — extracted from socket/handler.js triggerColdStart.
 *
 * Orchestrates the cold-start sequence:
 *   1. Begin if ready (coldStartService.beginIfReady)
 *   2. Write intro with streaming (coldStartService.writeIntro)
 *   3. Emit DJ message + chat history append
 *   4. Handle generated intro (TTS + music start)
 *   5. Safety timeout for music start
 *   6. Fallback to direct music start on error
 */

import { EVENTS } from './events.js';
import { emitColdStartResult } from './emitHelpers.js';
import { pushBubbles } from './bubbleHandler.js';

export async function triggerColdStart(io, deps) {
  const { coldStartService, chatHistory, scheduler, queue } = deps;
  const logger = deps.logger || console;
  const start = coldStartService.beginIfReady();
  if (!start.shouldStart) {
    logger.warn(
      {
        component: 'cold-start',
        coldStartState: scheduler?.coldStartState,
        isPlaying: scheduler?.isPlaying,
        isAdvancing: scheduler?.isAdvancing,
        hasCurrentSong: !!scheduler?.playhead?.currentSong,
        queueHasCurrent: !!queue?.hasCurrent,
        queueFutureLength: queue?.future?.length ?? 0,
      },
      'cold start not ready — skipping (queue empty or state mismatch)',
    );
    return;
  }
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
      if (chatHistory) chatHistory.append('assistant', fullText);
      io.emit('cold-start:phase', { phase: 'speaking' });

      const coldStartResult = await coldStartService.handleGeneratedIntro({ fullText });
      emitColdStartResult(io, coldStartResult);
      if (coldStartResult.speechStart) {
        // M5: Safety timeout with error handling to prevent unhandled rejections
        setTimeout(async () => {
          try {
            const safetyResult = await coldStartService.startMusicIfStillInProgress();
            if (safetyResult) {
              logger.info({ component: 'cold-start' }, 'safety timeout - starting music');
              emitColdStartResult(io, safetyResult);
            }
          } catch (e) {
            logger.error({ component: 'cold-start', err: e }, 'safety timeout error');
          }
        }, 30000);
      }

      // Cold-start bubble: push bubbles 8s after music starts
      setTimeout(() => pushBubbles(io, deps), 8000);
    } else {
      throw new Error('Cold open returned empty text');
    }
  } catch (e) {
    logger.warn({ component: 'cold-start', err: e }, 'cold start failed, starting music directly');
    emitColdStartResult(io, await coldStartService.startMusicDirectly());

    // Cold-start bubble (fallback path): push bubbles 8s after direct music start
    setTimeout(() => pushBubbles(io, deps), 8000);
  }
}

/**
 * Re-trigger cold start if a client is waiting (coldStartState === 'pending').
 *
 * Called after the queue is filled (restoreNeteaseSession) to recover from
 * the race where client:ready arrived before the queue had any songs.
 *
 * @param {object} io Socket.IO server instance.
 * @param {object} deps Service dependencies (must include scheduler).
 * @returns {Promise<boolean>} true if cold start was attempted, false if skipped.
 */
export async function triggerColdStartIfPending(io, deps) {
  const { scheduler } = deps;
  if (!scheduler || scheduler.coldStartState !== 'pending') return false;
  const logger = deps.logger || console;
  logger.info({ component: 'cold-start' }, 'queue ready — re-triggering pending cold start');
  await triggerColdStart(io, deps);
  return true;
}
