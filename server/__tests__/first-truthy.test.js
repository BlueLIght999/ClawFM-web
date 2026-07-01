import { describe, it, expect } from 'vitest';
import { firstTruthy } from '../domain/curation/firstTruthy.js';

/**
 * firstTruthy —— 返回参数中第一个真值，全假则返回最后一个（作为默认）。
 * 用于收敛 toSongDTO 的 `a || b || default` 回退链，降低圈复杂度
 * (分支移出 toSongDTO，逻辑集中且可测)。
 */
describe('firstTruthy', () => {
  it('returnsFirstTruthyValue', () => {
    expect(firstTruthy('', 'b', 'c')).toBe('b');
    expect(firstTruthy('a', 'b')).toBe('a');
  });

  it('allFalsy_returnsLastAsDefault', () => {
    expect(firstTruthy('', null, 'default')).toBe('default');
    expect(firstTruthy(0, undefined, 0)).toBe(0);
  });

  it('singleValue_returnsIt', () => {
    expect(firstTruthy('only')).toBe('only');
  });

  it('numericZeroFalsy_skippedUnlessLast', () => {
    expect(firstTruthy(0, 269000)).toBe(269000);
  });
});
