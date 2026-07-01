import { describe, it, expect } from 'vitest';
import { formatUserCorpus } from '../domain/curation/formatUserCorpus.js';

/**
 * 特征测试 —— 钉住 context.js slotUserCorpus 的纯格式化行为。
 * 提炼纯函数后，fs 读取移到 infrastructure，context.js 不再 import fs
 * (消除 arch warn: context.js → fs)。
 *
 * 现有行为(context.js slotUserCorpus):
 *   非空片段拼成 "## User Taste\n{taste}" 等，用 \n\n 连接，空片段过滤。
 */
describe('formatUserCorpus', () => {
  it('allThreePresent_joinsWithSectionHeaders', () => {
    const result = formatUserCorpus({
      taste: '喜欢 Reol',
      routines: '早晨轻音乐',
      moodRules: '难过时听民谣',
    });
    expect(result).toBe(
      '## User Taste\n喜欢 Reol\n\n' +
      '## User Routines\n早晨轻音乐\n\n' +
      '## Mood Rules\n难过时听民谣'
    );
  });

  it('emptySections_filteredOut', () => {
    const result = formatUserCorpus({ taste: '只有口味', routines: '', moodRules: '' });
    expect(result).toBe('## User Taste\n只有口味');
  });

  it('allEmpty_returnsEmptyString', () => {
    expect(formatUserCorpus({ taste: '', routines: '', moodRules: '' })).toBe('');
  });

  it('missingKeys_treatedAsEmpty', () => {
    expect(formatUserCorpus({})).toBe('');
  });
});
