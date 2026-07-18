/**
 * Plan block progression pure rules — extracted from QueueFillStrategies.
 *
 * Governs how the listening-plan block rotates during queue filling:
 *   - resolveActiveBlockHints: decide which block's genre hints are active
 *   - nextBlockIndex: circular index advancement
 *
 * All functions are pure: no side effects except mutating the planProgress
 * object (which is the caller's state, matching legacy behavior).
 */

/**
 * Compute the next circular block index.
 *
 * @param {number} currentIndex Current block index.
 * @param {number} blockCount Total number of blocks.
 * @returns {number} Next block index, wrapping to 0.
 * @throws Does not throw.
 */
export function nextBlockIndex(currentIndex, blockCount) {
  if (blockCount <= 0) return 0;
  return (currentIndex + 1) % blockCount;
}

/**
 * Resolve which block's genre hints are active for the current fill cycle.
 *
 * @param {Array|null|undefined} hints Plan blocks array.
 * @param {object} planProgress Mutable plan progress state.
 * @returns {Array|null} Array containing the active block, or null.
 * @throws Does not throw.
 * Constraint: mutates planProgress to advance/reset block index (legacy behavior).
 *   In autoMode, advances to next block when songsFilledInBlock >= targetCount.
 *   In manual mode (autoMode=false), stays on the pinned/selected block.
 */
export function resolveActiveBlockHints(hints, planProgress) {
  if (!hints || hints.length === 0) return null;

  const p = planProgress;
  if (p.currentBlockIndex >= hints.length) p.currentBlockIndex = 0;

  const block = hints[p.currentBlockIndex];
  if (!block) return null;

  if (p.autoMode !== false && p.songsFilledInBlock >= (block.targetCount || 5)) {
    p.currentBlockIndex = nextBlockIndex(p.currentBlockIndex, hints.length);
    p.songsFilledInBlock = 0;
    const nextBlock = hints[p.currentBlockIndex];
    return nextBlock ? [nextBlock] : null;
  }

  return [block];
}
