import { describe, expect, it } from 'vitest';
import { planSelectionIndex } from '../domain/routing/planSelectionIndex.js';

describe('planSelectionIndex', () => {
  it('planSelectionIndex_chineseOrdinal_returnsZeroBasedIndex', () => {
    expect(planSelectionIndex('切换到第二个主题')).toBe(1);
    expect(planSelectionIndex('换到第五个板块')).toBe(4);
  });

  it('planSelectionIndex_numericOrdinal_returnsZeroBasedIndex', () => {
    expect(planSelectionIndex('选 3 个主题')).toBe(2);
    expect(planSelectionIndex('切换到第1个块')).toBe(0);
  });

  it('planSelectionIndex_missingOrdinal_returnsDefaultIndex', () => {
    expect(planSelectionIndex('切换主题')).toBe(0);
    expect(planSelectionIndex('')).toBe(0);
  });
});
