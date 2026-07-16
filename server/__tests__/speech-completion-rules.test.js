import { describe, it, expect } from 'vitest';
import {
  classifySpeechCompletion,
  isColdStartCompletion,
  isNoOpCompletion,
} from '../domain/playback/speechCompletionRules.js';

describe('speech completion rules', () => {
  it('classifySpeechCompletion_coldStart_returnsColdStart', () => {
    expect(classifySpeechCompletion('cold-start')).toBe('cold-start');
  });

  it('classifySpeechCompletion_chat_returnsNoOp', () => {
    expect(classifySpeechCompletion('chat')).toBe('no-op');
  });

  it('classifySpeechCompletion_chatAnnounce_returnsNoOp', () => {
    expect(classifySpeechCompletion('chat-announce')).toBe('no-op');
  });

  it('classifySpeechCompletion_proactive_returnsNoOp', () => {
    expect(classifySpeechCompletion('proactive')).toBe('no-op');
  });

  it('classifySpeechCompletion_undefined_returnsNormal', () => {
    expect(classifySpeechCompletion(undefined)).toBe('normal');
  });

  it('classifySpeechCompletion_null_returnsNormal', () => {
    expect(classifySpeechCompletion(null)).toBe('normal');
  });

  it('classifySpeechCompletion_transition_returnsNormal', () => {
    expect(classifySpeechCompletion('transition')).toBe('normal');
  });

  it('classifySpeechCompletion_refill_returnsNormal', () => {
    expect(classifySpeechCompletion('refill')).toBe('normal');
  });

  it('isColdStartCompletion_coldStart_returnsTrue', () => {
    expect(isColdStartCompletion('cold-start')).toBe(true);
  });

  it('isColdStartCompletion_other_returnsFalse', () => {
    expect(isColdStartCompletion('transition')).toBe(false);
    expect(isColdStartCompletion('chat')).toBe(false);
    expect(isColdStartCompletion(undefined)).toBe(false);
  });

  it('isNoOpCompletion_chat_returnsTrue', () => {
    expect(isNoOpCompletion('chat')).toBe(true);
  });

  it('isNoOpCompletion_chatAnnounce_returnsTrue', () => {
    expect(isNoOpCompletion('chat-announce')).toBe(true);
  });

  it('isNoOpCompletion_proactive_returnsTrue', () => {
    expect(isNoOpCompletion('proactive')).toBe(true);
  });

  it('isNoOpCompletion_other_returnsFalse', () => {
    expect(isNoOpCompletion('cold-start')).toBe(false);
    expect(isNoOpCompletion('transition')).toBe(false);
    expect(isNoOpCompletion(undefined)).toBe(false);
  });
});
