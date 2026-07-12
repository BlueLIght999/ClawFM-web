import { describe, it, expect } from 'vitest';
import {
  planProgressPatch,
  planUpdatePayload,
  shouldRefillForPlanBlocks,
} from '../domain/curation/planBlockRules.js';

describe('plan block interaction rules', () => {
  it('planProgressPatch_selectBlock_disablesAutoModeAndResetsBlockCounter', () => {
    expect(planProgressPatch('select', 2)).toEqual({
      autoMode: false,
      currentBlockIndex: 2,
      songsFilledInBlock: 0,
    });
  });

  it('planProgressPatch_selectNull_resumesAutoModeWithoutChangingCurrentBlock', () => {
    expect(planProgressPatch('select', null)).toEqual({ autoMode: true });
  });

  it('planProgressPatch_pinBlock_pinsSelectedBlockAndResetsCounter', () => {
    expect(planProgressPatch('pin', 1)).toEqual({
      pinned: true,
      autoMode: false,
      currentBlockIndex: 1,
      songsFilledInBlock: 0,
    });
  });

  it('planProgressPatch_clear_resumesAutoModeAndUnpins', () => {
    expect(planProgressPatch('clear')).toEqual({ autoMode: true, pinned: false });
  });

  it('planUpdatePayload_addsStableSelectionFieldsWithoutMutatingPlan', () => {
    const plan = { blocks: [{ id: 'morning' }], mood: 'bright' };

    expect(planUpdatePayload(plan, { activeBlockIndex: 0, pinnedBlockIndex: 0 })).toEqual({
      blocks: [{ id: 'morning' }],
      mood: 'bright',
      activeBlockIndex: 0,
      pinnedBlockIndex: 0,
    });
    expect(plan).toEqual({ blocks: [{ id: 'morning' }], mood: 'bright' });
  });

  it('shouldRefillForPlanBlocks_onlyRefillsWhenPlanHasBlocks', () => {
    expect(shouldRefillForPlanBlocks([{ id: 'block' }])).toBe(true);
    expect(shouldRefillForPlanBlocks([])).toBe(false);
    expect(shouldRefillForPlanBlocks(null)).toBe(false);
  });
});
