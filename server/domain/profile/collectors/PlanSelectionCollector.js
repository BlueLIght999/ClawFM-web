/**
 * PlanSelectionCollector — gathers listening-plan block selection behavior.
 *
 * Extends BaseCollector. Reads plan data from an injected planRepository
 * (exposing get()) and derives which block the listener selected/pinned, or
 * whether the selection was cleared. Each outcome is projected to evidence:
 *   { type:'plan_selection', blockId, blockLabel, action }
 * where action ∈ 'selected' | 'pinned' | 'cleared'.
 *
 * Derivation rules (from current plan state):
 *   - pinned === true              → 'pinned'  (uses pinnedBlockIndex || currentBlockIndex)
 *   - autoMode === false && a      → 'selected'
 *     currentBlockIndex is set
 *   - otherwise (autoMode, no pin) → 'cleared' (blockId/blockLabel null)
 *
 * When there is no plan data at all, returns empty evidence.
 * Pure domain logic; repository is injected.
 */

import { BaseCollector } from './BaseCollector.js';

function blockAt(blocks, index) {
  if (!Array.isArray(blocks)) return null;
  if (index === null || index === undefined) return null;
  if (index < 0 || index >= blocks.length) return null;
  return blocks[index] || null;
}

function blockIdOf(block) {
  if (!block) return null;
  return block.id || block.blockId || block.block_id || null;
}

function blockLabelOf(block) {
  if (!block) return null;
  return block.label || block.blockLabel || block.name || block.title || null;
}

export class PlanSelectionCollector extends BaseCollector {
  /**
   * @param {Object}  [opts]
   * @param {string}  [opts.name]
   * @param {Object}  [opts.eventBus]
   */
  constructor({ name, eventBus } = {}) {
    super({ name, eventBus });
  }

  /**
   * @param {Object} sources
   * @param {Object|Function} [sources.planRepository]
   * @returns {Promise<{evidence:Array, count:number}>}
   */
  async collect({ planRepository } = {}) {
    const plan = await this._fetchPlan(planRepository);
    if (!plan) {
      this.emit('collection:completed', { evidenceCount: 0 });
      return { evidence: [], count: 0 };
    }

    const evidence = this._deriveEvidence(plan);
    this.emit('collection:completed', { evidenceCount: evidence.length });
    return { evidence, count: evidence.length };
  }

  _deriveEvidence(plan) {
    const blocks = plan.blocks || plan.planBlocks || [];
    const autoMode = plan.autoMode ?? true;
    const pinned = plan.pinned === true;
    const currentBlockIndex = plan.currentBlockIndex ?? plan.activeBlockIndex ?? null;
    const pinnedBlockIndex = plan.pinnedBlockIndex ?? currentBlockIndex;

    if (pinned) {
      const block = blockAt(blocks, pinnedBlockIndex);
      return [
        {
          type: 'plan_selection',
          blockId: blockIdOf(block),
          blockLabel: blockLabelOf(block),
          action: 'pinned',
        },
      ];
    }

    if (autoMode === false && currentBlockIndex !== null) {
      const block = blockAt(blocks, currentBlockIndex);
      return [
        {
          type: 'plan_selection',
          blockId: blockIdOf(block),
          blockLabel: blockLabelOf(block),
          action: 'selected',
        },
      ];
    }

    // autoMode active and nothing pinned → no active selection (cleared).
    return [
      {
        type: 'plan_selection',
        blockId: null,
        blockLabel: null,
        action: 'cleared',
      },
    ];
  }

  async _fetchPlan(repo) {
    if (!repo) return null;
    let result;
    if (typeof repo.get === 'function') result = repo.get();
    else if (typeof repo === 'function') result = repo();
    else return null;
    return (await result) || null;
  }
}
