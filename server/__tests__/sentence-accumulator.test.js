import { describe, it, expect } from 'vitest';
import { createSentenceAccumulator } from '../agent/domain/sentenceAccumulator.js';

describe('SentenceAccumulator', () => {
  it('singleSentence_outputsOnPunctuation', () => {
    const acc = createSentenceAccumulator();
    const sentences = acc.feed('你好。');
    expect(sentences).toEqual(['你好。']);
  });

  it('multipleSentences_outputsEachOnPunctuation', () => {
    const acc = createSentenceAccumulator();
    const s1 = acc.feed('你好。');
    const s2 = acc.feed('世界！');
    expect(s1).toEqual(['你好。']);
    expect(s2).toEqual(['世界！']);
  });

  it('sentenceAcrossTokens_correctlyJoins', () => {
    const acc = createSentenceAccumulator();
    const s1 = acc.feed('你');
    const s2 = acc.feed('好');
    const s3 = acc.feed('。');
    expect(s1).toEqual([]);
    expect(s2).toEqual([]);
    expect(s3).toEqual(['你好。']);
  });

  it('noPunctuation_returnsEmpty', () => {
    const acc = createSentenceAccumulator();
    expect(acc.feed('没有标点的文本')).toEqual([]);
  });

  it('flush_returnsRemainingText', () => {
    const acc = createSentenceAccumulator();
    acc.feed('完整句子。');
    acc.feed('剩余部分');
    expect(acc.flush()).toBe('剩余部分');
    // Second flush returns null
    expect(acc.flush()).toBeNull();
  });

  it('mixedPunctuation_allRecognized', () => {
    const acc = createSentenceAccumulator();
    const sentences = acc.feed('你好。世界！how are you?');
    expect(sentences).toEqual(['你好。', '世界！', 'how are you?']);
  });

  it('emptyInput_returnsEmpty', () => {
    const acc = createSentenceAccumulator();
    expect(acc.feed('')).toEqual([]);
  });
});
