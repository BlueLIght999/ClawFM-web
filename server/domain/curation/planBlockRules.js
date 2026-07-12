const HAS_BLOCK_INDEX = value => value !== null && value !== undefined;

/**
 * Build the state patch for direct listening-plan block interactions.
 *
 * @param {'select'|'pin'|'clear'} action Interaction kind from the socket boundary.
 * @param {number|null|undefined} blockIndex Selected block index, when applicable.
 * @returns {object} Minimal plan-progress patch; never mutates existing state.
 * @throws Does not throw for unknown actions; returns an empty patch for forward compatibility.
 * Constraint: this is pure domain logic and must not read queue, DB, socket, or planner state.
 */
export function planProgressPatch(action, blockIndex = null) {
  if (action === 'select') {
    if (!HAS_BLOCK_INDEX(blockIndex)) return { autoMode: true };
    return {
      autoMode: false,
      currentBlockIndex: blockIndex,
      songsFilledInBlock: 0,
    };
  }

  if (action === 'pin') {
    if (!HAS_BLOCK_INDEX(blockIndex)) return { pinned: false, autoMode: true };
    return {
      pinned: true,
      autoMode: false,
      currentBlockIndex: blockIndex,
      songsFilledInBlock: 0,
    };
  }

  if (action === 'clear') return { autoMode: true, pinned: false };

  return {};
}

/**
 * Create the plan payload emitted to clients after block interaction.
 *
 * @param {object|null|undefined} plan Cached listening plan DTO.
 * @param {object} selectionFields Active/pinned block fields to expose to the UI.
 * @returns {object} New payload preserving the legacy socket shape.
 * @throws Does not throw when plan is missing; emits only selection fields.
 * Constraint: callers decide whether to emit; this function only shapes data.
 */
export function planUpdatePayload(plan, selectionFields) {
  return { ...(plan || {}), ...selectionFields };
}

/**
 * Decide whether a direct plan interaction should refill the queue.
 *
 * @param {Array|null|undefined} blocks Cached plan blocks.
 * @returns {boolean} True when there is at least one block to use as fill hints.
 * @throws Never.
 * Constraint: keeps legacy behavior where empty plans still emit plan updates.
 */
export function shouldRefillForPlanBlocks(blocks) {
  return Array.isArray(blocks) && blocks.length > 0;
}
