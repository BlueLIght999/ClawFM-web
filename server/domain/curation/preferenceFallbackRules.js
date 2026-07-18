/**
 * Preference fallback pure rules — extracted from QueueFillStrategies.
 *
 * Governs the three-tier preference-based queue filling:
 *   1. seedPool — match user's seed pool against preference keyword
 *   2. search — search music source with preference keyword
 *   3. genericFallback — use standard strategies without preference
 *
 * All functions are pure: no side effects, no I/O, no mutations.
 */

/**
 * Check whether the seedPool stage should be attempted.
 *
 * @param {{preference: string|null, seedPoolSize: number}} input
 * @returns {boolean}
 * @throws Does not throw.
 */
export function shouldFillFromSeedPool({ preference, seedPoolSize }) {
  if (!preference) return false;
  if (seedPoolSize <= 0) return false;
  return true;
}

/**
 * Check whether the search stage should be attempted.
 *
 * @param {{preference: string|null, currentCount: number, targetSize: number}} input
 * @returns {boolean}
 * @throws Does not throw.
 */
export function shouldFillFromSearch({ preference, currentCount, targetSize }) {
  if (!preference) return false;
  if (currentCount >= targetSize) return false;
  return true;
}

/**
 * Check whether the generic fallback stage should be attempted.
 *
 * @param {{currentCount: number, targetSize: number}} input
 * @returns {boolean}
 * @throws Does not throw.
 */
export function shouldFillFromGenericFallback({ currentCount, targetSize }) {
  return currentCount < targetSize;
}

/**
 * Build the ordered list of fallback stages to attempt.
 *
 * @param {object} input
 * @param {string|null} input.preference User preference keyword.
 * @param {number} input.currentCount Current number of songs collected.
 * @param {number} input.targetSize Target queue size.
 * @param {number} input.seedPoolSize Number of songs in the seed pool.
 * @returns {{stages: string[]}} Ordered list of stages to attempt.
 * @throws Does not throw.
 * Constraint: the executor is responsible for short-circuiting when targetSize is met.
 *   This function returns all potentially-needed stages based on inputs.
 */
export function preferenceFallbackPlan({ preference, currentCount, targetSize, seedPoolSize }) {
  if (currentCount >= targetSize) return { stages: [] };

  const stages = [];
  if (shouldFillFromSeedPool({ preference, seedPoolSize })) {
    stages.push('seedPool');
  }
  if (shouldFillFromSearch({ preference, currentCount, targetSize })) {
    stages.push('search');
  }
  if (shouldFillFromGenericFallback({ currentCount, targetSize })) {
    stages.push('genericFallback');
  }

  return { stages };
}
