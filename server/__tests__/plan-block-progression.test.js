import { describe, it, expect } from 'vitest';
import { resolveActiveBlockHints, nextBlockIndex } from '../domain/curation/planBlockProgression.js';

describe('resolveActiveBlockHints', () => {
  const blocks = [
    { genreHints: ['jazz'], targetCount: 5 },
    { genreHints: ['rock'], targetCount: 3 },
    { genreHints: ['classical'], targetCount: 4 },
  ];

  it('returns null when hints is null', () => {
    const result = resolveActiveBlockHints(null, { currentBlockIndex: 0, songsFilledInBlock: 0, autoMode: true });
    expect(result).toBeNull();
  });

  it('returns null when hints is empty array', () => {
    const result = resolveActiveBlockHints([], { currentBlockIndex: 0, songsFilledInBlock: 0, autoMode: true });
    expect(result).toBeNull();
  });

  it('returns current block as array when autoMode is false', () => {
    const planProgress = { currentBlockIndex: 1, songsFilledInBlock: 0, autoMode: false };
    const result = resolveActiveBlockHints(blocks, planProgress);
    expect(result).toEqual([{ genreHints: ['rock'], targetCount: 3 }]);
  });

  it('advances to next block when songsFilledInBlock reaches targetCount in autoMode', () => {
    const planProgress = { currentBlockIndex: 0, songsFilledInBlock: 5, autoMode: true };
    const result = resolveActiveBlockHints(blocks, planProgress);
    expect(result).toEqual([{ genreHints: ['rock'], targetCount: 3 }]);
    expect(planProgress.currentBlockIndex).toBe(1);
    expect(planProgress.songsFilledInBlock).toBe(0);
  });

  it('wraps around to first block after last block completes', () => {
    const planProgress = { currentBlockIndex: 2, songsFilledInBlock: 4, autoMode: true };
    const result = resolveActiveBlockHints(blocks, planProgress);
    expect(result).toEqual([{ genreHints: ['jazz'], targetCount: 5 }]);
    expect(planProgress.currentBlockIndex).toBe(0);
  });

  it('uses default targetCount of 5 when block has no targetCount', () => {
    const blocksNoTarget = [{ genreHints: ['pop'] }];
    const planProgress = { currentBlockIndex: 0, songsFilledInBlock: 4, autoMode: true };
    const result = resolveActiveBlockHints(blocksNoTarget, planProgress);
    // 4 < 5 (default), so should stay on current block
    expect(result).toEqual([{ genreHints: ['pop'] }]);
  });

  it('resets currentBlockIndex when out of bounds', () => {
    const planProgress = { currentBlockIndex: 99, songsFilledInBlock: 0, autoMode: true };
    const result = resolveActiveBlockHints(blocks, planProgress);
    expect(planProgress.currentBlockIndex).toBe(0);
    expect(result).toEqual([{ genreHints: ['jazz'], targetCount: 5 }]);
  });

  it('does not advance when autoMode is false even if target reached', () => {
    const planProgress = { currentBlockIndex: 0, songsFilledInBlock: 10, autoMode: false };
    const result = resolveActiveBlockHints(blocks, planProgress);
    expect(result).toEqual([{ genreHints: ['jazz'], targetCount: 5 }]);
    expect(planProgress.currentBlockIndex).toBe(0);
  });

  it('handles single block by wrapping to itself', () => {
    const singleBlock = [{ genreHints: ['jazz'], targetCount: 3 }];
    const planProgress = { currentBlockIndex: 0, songsFilledInBlock: 3, autoMode: true };
    resolveActiveBlockHints(singleBlock, planProgress);
    expect(planProgress.currentBlockIndex).toBe(0);
    expect(planProgress.songsFilledInBlock).toBe(0);
  });
});

describe('nextBlockIndex', () => {
  it('returns next index for non-last block', () => {
    expect(nextBlockIndex(0, 3)).toBe(1);
    expect(nextBlockIndex(1, 3)).toBe(2);
  });

  it('wraps to 0 for last block', () => {
    expect(nextBlockIndex(2, 3)).toBe(0);
  });

  it('handles single block (returns 0)', () => {
    expect(nextBlockIndex(0, 1)).toBe(0);
  });

  it('handles index out of bounds by wrapping', () => {
    expect(nextBlockIndex(5, 3)).toBe(0);
  });
});
