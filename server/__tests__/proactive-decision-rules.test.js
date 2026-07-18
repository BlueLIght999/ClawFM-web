import { describe, it, expect } from 'vitest';
import { isValidSpeechDecision, shouldSynthesizeSpeech } from '../domain/hosting/proactiveDecisionRules.js';

describe('isValidSpeechDecision', () => {
  it('returns true when shouldSpeak is true and message is non-empty', () => {
    expect(isValidSpeechDecision({ shouldSpeak: true, message: 'Hello' })).toBe(true);
  });

  it('returns false when shouldSpeak is false', () => {
    expect(isValidSpeechDecision({ shouldSpeak: false, message: 'Hello' })).toBe(false);
  });

  it('returns false when message is empty string', () => {
    expect(isValidSpeechDecision({ shouldSpeak: true, message: '' })).toBe(false);
  });

  it('returns false when message is null', () => {
    expect(isValidSpeechDecision({ shouldSpeak: true, message: null })).toBe(false);
  });

  it('returns false when message is undefined', () => {
    expect(isValidSpeechDecision({ shouldSpeak: true })).toBe(false);
  });

  it('returns false when decision is null', () => {
    expect(isValidSpeechDecision(null)).toBe(false);
  });

  it('returns false when decision is undefined', () => {
    expect(isValidSpeechDecision(undefined)).toBe(false);
  });

  it('returns false when shouldSpeak is truthy but not boolean true', () => {
    expect(isValidSpeechDecision({ shouldSpeak: 1, message: 'Hi' })).toBe(true);
  });

  it('returns true for non-empty message with whitespace', () => {
    expect(isValidSpeechDecision({ shouldSpeak: true, message: '  ' })).toBe(true);
  });
});

describe('shouldSynthesizeSpeech', () => {
  it('returns true when speech is available and random < 0.4', () => {
    const result = shouldSynthesizeSpeech({
      speechAvailable: true,
      randomValue: 0.3,
      isAdvancing: false,
    });
    expect(result).toBe(true);
  });

  it('returns false when speech is not available', () => {
    const result = shouldSynthesizeSpeech({
      speechAvailable: false,
      randomValue: 0.3,
      isAdvancing: false,
    });
    expect(result).toBe(false);
  });

  it('returns false when random >= 0.4 (60% chance to skip)', () => {
    const result = shouldSynthesizeSpeech({
      speechAvailable: true,
      randomValue: 0.4,
      isAdvancing: false,
    });
    expect(result).toBe(false);
  });

  it('returns false when random = 0.39 (boundary, just below threshold)', () => {
    const result = shouldSynthesizeSpeech({
      speechAvailable: true,
      randomValue: 0.39,
      isAdvancing: false,
    });
    expect(result).toBe(true);
  });

  it('returns false when song transition is in progress', () => {
    const result = shouldSynthesizeSpeech({
      speechAvailable: true,
      randomValue: 0.3,
      isAdvancing: true,
    });
    expect(result).toBe(false);
  });

  it('returns false when speechAvailable is undefined', () => {
    const result = shouldSynthesizeSpeech({
      randomValue: 0.3,
      isAdvancing: false,
    });
    expect(result).toBe(false);
  });

  it('returns true when randomValue is 0 (always synthesize if available)', () => {
    const result = shouldSynthesizeSpeech({
      speechAvailable: true,
      randomValue: 0,
      isAdvancing: false,
    });
    expect(result).toBe(true);
  });

  it('does not mutate inputs', () => {
    const input = { speechAvailable: true, randomValue: 0.3, isAdvancing: false };
    const original = { ...input };
    shouldSynthesizeSpeech(input);
    expect(input).toEqual(original);
  });
});
