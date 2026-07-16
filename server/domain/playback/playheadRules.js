const DEFAULT_DURATION_MS = 240000;

/**
 * Calculate elapsed playback time from a playhead snapshot.
 *
 * @param {object} playhead Current playhead state.
 * @param {number} nowMs Current timestamp in milliseconds.
 * @returns {number} Elapsed playback time in milliseconds.
 * @throws Does not throw.
 * Constraint: returns 0 when playback is paused or no start time is available.
 */
export function playheadElapsedMs(playhead, nowMs) {
  if (!playhead?.isPlaying || !playhead?.startedAt) return 0;
  return Math.min(nowMs - playhead.startedAt, playhead.songDuration || 0);
}

/**
 * Build the paused playhead state without mutating the input object.
 *
 * @param {object} playhead Current playhead state.
 * @param {number} nowMs Current timestamp in milliseconds.
 * @returns {object} New paused playhead, or the original object when already paused.
 * @throws Does not throw.
 * Constraint: remainingAtPause mirrors the legacy scheduler calculation.
 */
export function pausePlayhead(playhead, nowMs) {
  if (!playhead?.isPlaying) return playhead;
  return {
    ...playhead,
    remainingAtPause: playhead.songDuration - playheadElapsedMs(playhead, nowMs),
    isPlaying: false,
  };
}

/**
 * Build the resumed playhead state without mutating the input object.
 *
 * @param {object} playhead Current playhead state.
 * @param {number} nowMs Current timestamp in milliseconds.
 * @returns {object} New playing playhead, or the original object when resume is not valid.
 * @throws Does not throw.
 * Constraint: uses remainingAtPause first, then existing duration, then the legacy fallback duration.
 */
export function resumePlayhead(playhead, nowMs) {
  if (playhead?.isPlaying || !playhead?.currentSong) return playhead;
  return {
    ...playhead,
    startedAt: nowMs,
    songDuration: playhead.remainingAtPause || playhead.songDuration || DEFAULT_DURATION_MS,
    isPlaying: true,
  };
}

/**
 * Build the playhead state after seeking to a new position.
 *
 * @param {object} playhead Current playhead state.
 * @param {{positionMs: number, nowMs: number}} input Seek target and timestamp.
 * @returns {object} New playhead with startedAt adjusted so elapsed equals the target position.
 * @throws Does not throw.
 * Constraint: recalculates remainingAtPause so resumePlayhead uses the correct remaining
 *   duration after a seek (fixes stale remainingAtPause bug where pause→seek→resume
 *   caused premature song-ending transitions).
 */
export function seekPlayhead(playhead, { positionMs, nowMs }) {
  const songDuration = playhead?.songDuration || DEFAULT_DURATION_MS;
  return {
    ...playhead,
    startedAt: nowMs - positionMs,
    remainingAtPause: Math.max(songDuration - positionMs, 0),
  };
}
