/**
 * Proactive context building pure rules — extracted from services/proactive.js.
 *
 * Builds the decision context object passed to the proactive speech decider.
 * Pure function: no side effects, no I/O, no mutations.
 */

/**
 * Compute whether the hour has changed since the last proactive check.
 *
 * @param {number} lastHour Previously recorded hour (-1 on first call).
 * @param {number} currentHour Current hour of the day.
 * @returns {boolean} True when the hour has changed.
 * @throws Does not throw.
 */
export function computeHourChanged(lastHour, currentHour) {
  if (lastHour < 0) return false;
  return lastHour !== currentHour;
}

/**
 * Build the proactive speech decision context.
 *
 * @param {object} input
 * @param {object} input.scheduler Scheduler with currentSong and songsSinceLastSpeech.
 * @param {object} input.queue Queue with upcomingSongs.
 * @param {function} input.getPlan Returns the cached plan (with plan.blocks or blocks).
 * @param {string} input.timeOfDay Time-of-day mood string.
 * @param {number} input.nowMs Current timestamp in ms.
 * @param {number} input.lastSpeechMs Timestamp of last proactive speech.
 * @param {boolean} input.hourChanged Whether the hour just changed.
 * @returns {object} Decision context object.
 * @throws Does not throw.
 */
export function buildProactiveContext({ scheduler, queue, getPlan, timeOfDay, nowMs, lastSpeechMs, hourChanged }) {
  const upcoming = queue?.upcomingSongs || [];

  const plan = getPlan?.() || null;
  const planData = plan?.plan || plan;
  const blocks = planData?.blocks || [];

  return {
    currentSong: scheduler?.currentSong ?? null,
    timeOfDay,
    activeBlock: blocks[0] || null,
    nextSong: upcoming[0] || null,
    secondNext: upcoming[1] || null,
    secondsSinceLastSpeech: Math.floor((nowMs - lastSpeechMs) / 1000),
    songsSinceLastSpeech: scheduler?.songsSinceLastSpeech ?? 0,
    hourChanged,
  };
}
