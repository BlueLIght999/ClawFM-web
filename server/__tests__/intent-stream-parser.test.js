import { describe, it, expect } from 'vitest';
import { createIntentStreamParser, INTENT_SEPARATOR } from '../agent/domain/intentStreamParser.js';

describe('IntentStreamParser', () => {
  it('singleToken_withCompleteIntent_parsesCorrectly', () => {
    const p = createIntentStreamParser();
    p.feed(`{"action":"play_mood","params":{"mood":"happy"}}${INTENT_SEPARATOR}让我来挑几首歌。`);
    expect(p.isIntentReady()).toBe(true);
    expect(p.getIntent()).toEqual({ action: 'play_mood', params: { mood: 'happy' } });
    expect(p.getReplyTokens()).toEqual(['让我来挑几首歌。']);
  });

  it('intentAcrossMultipleTokens_correctlyJoins', () => {
    const p = createIntentStreamParser();
    p.feed('{"action":');
    p.feed('"chat"');
    p.feed(',"params":{}}');
    p.feed(INTENT_SEPARATOR);
    p.feed('你好！');
    expect(p.getIntent()).toEqual({ action: 'chat', params: {} });
    expect(p.getReplyTokens()).toEqual(['你好！']);
  });

  it('separatorAcrossTokenBoundary_correctlyDetected', () => {
    const p = createIntentStreamParser();
    p.feed('{"action":"chat"}|');
    p.feed('||');
    p.feed('回复');
    expect(p.isIntentReady()).toBe(true);
    expect(p.getReplyTokens()).toEqual(['回复']);
  });

  it('invalidJSON_fallsBackToChat', () => {
    const p = createIntentStreamParser();
    p.feed(`not json${INTENT_SEPARATOR}回复`);
    expect(p.getIntent()).toEqual({ action: 'chat', params: {} });
  });

  it('noSeparator_flushReturnsFallback', () => {
    const p = createIntentStreamParser();
    p.feed('just some text without separator');
    expect(p.isIntentReady()).toBe(false);
    const intent = p.flush();
    expect(intent).toEqual({ action: 'chat', params: {} });
  });

  it('emptyStream_flushReturnsFallback', () => {
    const p = createIntentStreamParser();
    const intent = p.flush();
    expect(intent).toEqual({ action: 'chat', params: {} });
  });

  it('nestedParams_parsedCorrectly', () => {
    const p = createIntentStreamParser();
    p.feed(`{"action":"play_artist","params":{"artist":"周杰伦","song":"晴天"}}${INTENT_SEPARATOR}好的！`);
    expect(p.getIntent().params).toEqual({ artist: '周杰伦', song: '晴天' });
  });

  it('clearReplyTokens_emptiesBuffer', () => {
    const p = createIntentStreamParser();
    p.feed(`{"action":"chat"}${INTENT_SEPARATOR}第一句。`);
    expect(p.getReplyTokens()).toHaveLength(1);
    p.clearReplyTokens();
    expect(p.getReplyTokens()).toHaveLength(0);
    p.feed('第二句。');
    expect(p.getReplyTokens()).toEqual(['第二句。']);
  });
});
