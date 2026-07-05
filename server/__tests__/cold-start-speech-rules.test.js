import { describe, it, expect } from 'vitest';
import {
  coldStartRetrySpeechText,
  coldStartSpeechText,
  shouldAttemptColdStartTts,
  textOnlyColdStartReason,
} from '../domain/hosting/coldStartSpeechRules.js';

describe('cold start speech rules', () => {
  it('coldStartSpeechText_stripsTagsAndStopsAtSentenceBoundary', () => {
    // Given
    const fullText = `<warm>${'开场铺垫'.repeat(28)}。第二句留给重试。第三句不进入首轮。`;

    // When
    const speechText = coldStartSpeechText(fullText);

    // Then
    expect(speechText).not.toContain('<warm>');
    expect(speechText.endsWith('。')).toBe(true);
    expect(speechText.length).toBeLessThan(fullText.length);
  });

  it('coldStartSpeechText_withoutEarlySentenceBoundary_clampsToTwoHundredChars', () => {
    // Given
    const fullText = '没有早期标点'.repeat(40);

    // When
    const speechText = coldStartSpeechText(fullText);

    // Then
    expect(speechText).toHaveLength(200);
  });

  it('coldStartRetrySpeechText_firstAttemptFailed_returnsShorterTwoSentenceText', () => {
    // Given
    const speechText = '第一句用于欢迎。第二句用于介绍。第三句应该被截掉。';

    // When
    const retryText = coldStartRetrySpeechText(speechText);

    // Then
    expect(retryText).toBe('第一句用于欢迎。第二句用于介绍。');
    expect(retryText.length).toBeLessThan(speechText.length);
  });

  it('coldStartRetrySpeechText_whenAlreadyShort_returnsEmptyString', () => {
    expect(coldStartRetrySpeechText('短句。')).toBe('');
  });

  it('shouldAttemptColdStartTts_healthKnownUnavailable_returnsFalse', () => {
    expect(shouldAttemptColdStartTts(false)).toBe(false);
  });

  it('shouldAttemptColdStartTts_unknownOrAvailable_returnsTrue', () => {
    expect(shouldAttemptColdStartTts(null)).toBe(true);
    expect(shouldAttemptColdStartTts(true)).toBe(true);
  });

  it('textOnlyColdStartReason_missingReason_returnsFallback', () => {
    expect(textOnlyColdStartReason({ reason: '' })).toBe('TTS unavailable');
    expect(textOnlyColdStartReason(null)).toBe('TTS unavailable');
  });
});
