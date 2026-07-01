import { describe, it, expect } from 'vitest';
import { slotUserCorpus } from '../services/context.js';

/**
 * 测试 slotUserCorpus 接受注入的 CorpusPort，从中读取语料。
 * 用内存 corpus 实现（CorpusPort 的合法替身，非 mock —— 真实实现接口）。
 * 目的：context.js 不再直接 import fs，读文件走注入的 corpus（DI, D2/D5）。
 *
 * 复用已测的 formatUserCorpus 做格式化，故此处只验证"从 corpus 读取并组装"。
 */
function makeCorpus({ taste = '', routines = '', moodRules = '' } = {}) {
  return {
    readTaste: () => taste,
    readRoutines: () => routines,
    readMoodRules: () => moodRules,
  };
}

describe('slotUserCorpus (injected CorpusPort)', () => {
  it('readsFromInjectedCorpus_formatsSections', () => {
    const corpus = makeCorpus({ taste: '喜欢 Reol', routines: '早晨轻音乐' });
    const result = slotUserCorpus(corpus);
    expect(result).toBe('## User Taste\n喜欢 Reol\n\n## User Routines\n早晨轻音乐');
  });

  it('emptyCorpus_returnsEmptyString', () => {
    const result = slotUserCorpus(makeCorpus());
    expect(result).toBe('');
  });

  it('allThreeSections_present', () => {
    const corpus = makeCorpus({ taste: 'T', routines: 'R', moodRules: 'M' });
    const result = slotUserCorpus(corpus);
    expect(result).toContain('## User Taste\nT');
    expect(result).toContain('## User Routines\nR');
    expect(result).toContain('## Mood Rules\nM');
  });
});
