/**
 * Pure domain rules for client lifecycle management.
 *
 * When all clients disconnect, the radio should stop music and reset
 * to a fresh cold-start state so the next visitor gets a clean session.
 */

/**
 * Decide whether music should stop based on remaining client count.
 *
 * @param {number} connectedClients — remaining connected clients.
 * @returns {boolean} true if music should stop (0 or negative clients).
 */
export function shouldStopMusicForNextSession(connectedClients) {
  return connectedClients <= 0;
}
