const BOOP_IDLE_RESET_MS = 2000;

/**
 * Determine whether a crab interaction should skip playback.
 *
 * @param {string} interaction Client interaction name.
 * @returns {boolean} True only for the legacy `skip` interaction.
 * @throws Never.
 * Constraint: pure rule; no scheduler, socket, or timer access.
 */
export function isCrabSkipInteraction(interaction) {
  return interaction === 'skip';
}

/**
 * Resolve the immediate animation for a crab interaction.
 *
 * @param {string} interaction Client interaction name.
 * @returns {{state: string}|null} Animation payload, or null when no animation is emitted.
 * @throws Never.
 * Constraint: preserves legacy fallback where unknown interactions bounce.
 */
export function crabAnimationForInteraction(interaction) {
  if (isCrabSkipInteraction(interaction)) return null;
  if (interaction === 'chat') return { state: 'talking' };
  return { state: 'bouncing' };
}

/**
 * Resolve a delayed idle reset for interactions that need one.
 *
 * @param {string} interaction Client interaction name.
 * @returns {{delayMs: number, animation: {state: string}}|null} Delayed animation descriptor.
 * @throws Never.
 * Constraint: describes timing only; caller owns scheduling.
 */
export function crabIdleResetForInteraction(interaction) {
  if (interaction !== 'boop') return null;
  return {
    delayMs: BOOP_IDLE_RESET_MS,
    animation: { state: 'idle' },
  };
}
