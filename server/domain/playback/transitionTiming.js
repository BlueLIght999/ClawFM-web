const DEFAULT_DURATION_MS = 240000;
const SECOND_AS_MS = 1000;
const CROSSFADE_MS = 2500;
const DJ_SPEECH_BUFFER_MS = 4000;
const MIN_TRANSITION_DELAY_MS = 5000;

/**
 * Normalize song duration from stable Song DTO fields and legacy NetEase fields.
 *
 * @param {object|null} song Song-like object from queue or MusicSourcePort.
 * @returns {number} Duration in milliseconds.
 * @throws Does not throw.
 * Constraint: values below 1000 are treated as seconds for legacy callers.
 */
export function normalizePlaybackDurationMs(song) {
  const rawDuration = song?.durationMs || song?.dt || song?.duration || DEFAULT_DURATION_MS;
  return rawDuration < SECOND_AS_MS ? rawDuration * SECOND_AS_MS : rawDuration;
}

/**
 * Calculate when the scheduler should ask for DJ transition speech.
 *
 * @param {{durationMs: number, elapsedMs?: number, minimumDelayMs?: number}} input Playback timing.
 * @returns {number|null} Delay in milliseconds, or null when the track is too short.
 * @throws Does not throw.
 * Constraint: preserves the legacy crossfade/speech-buffer timing and 5s minimum timer delay.
 */
export function nextTransitionDelayMs({ durationMs, elapsedMs = 0, minimumDelayMs = MIN_TRANSITION_DELAY_MS }) {
  const remaining = durationMs - elapsedMs - CROSSFADE_MS - DJ_SPEECH_BUFFER_MS;
  if (remaining <= 0) return null;
  return Math.max(remaining, minimumDelayMs);
}
