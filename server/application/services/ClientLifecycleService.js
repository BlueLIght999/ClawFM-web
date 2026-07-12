import { shouldStopMusicForNextSession } from '../../domain/playback/clientLifecycleRules.js';

/**
 * Application seam for socket disconnect events.
 *
 * When a client disconnects, this service decides whether to stop
 * music and reset for the next session.  The handler is responsible
 * for tracking the connected-clients counter and emitting any socket
 * events.
 *
 * @param {{scheduler: object}} deps
 *   scheduler must expose: pause(), playhead (with currentSong,
 *     isPlaying), coldStartState (setter).
 * @returns {{handleDisconnect(connectedClients: number): {stoppedMusic: boolean}}}
 */
export function createClientLifecycleService({ scheduler }) {
  return {
    handleDisconnect(connectedClients) {
      if (!shouldStopMusicForNextSession(connectedClients)) {
        return { stoppedMusic: false };
      }

      scheduler.pause();
      scheduler.playhead.currentSong = null;
      scheduler.playhead.isPlaying = false;
      scheduler.coldStartState = 'pending';

      return { stoppedMusic: true };
    },
  };
}
