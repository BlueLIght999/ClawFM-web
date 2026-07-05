import { describe, it, expect } from 'vitest';
import {
  chatAnnouncementText,
  displayTextFromDjStream,
  fallbackStreamEndText,
  shouldAnnounceChatSpeech,
  streamTokenFromChunk,
} from '../domain/hosting/streamingChatRules.js';

describe('streaming chat rules', () => {
  it('streamTokenFromChunk_deltaContentExists_returnsToken', () => {
    expect(streamTokenFromChunk({ choices: [{ delta: { content: '你好' } }] })).toBe('你好');
  });

  it('streamTokenFromChunk_missingContent_returnsEmptyString', () => {
    expect(streamTokenFromChunk({ choices: [{ delta: {} }] })).toBe('');
    expect(streamTokenFromChunk(null)).toBe('');
  });

  it('displayTextFromDjStream_jsonSay_returnsSayOnly', () => {
    expect(displayTextFromDjStream('{"say":"今晚从这首开始","reason":"matched"}')).toBe('今晚从这首开始');
  });

  it('displayTextFromDjStream_invalidJson_returnsRawText', () => {
    expect(displayTextFromDjStream('不是 JSON，就原样显示')).toBe('不是 JSON，就原样显示');
  });

  it('displayTextFromDjStream_jsonWithoutSay_returnsRawText', () => {
    const raw = '{"reply":"没有 say 字段"}';

    expect(displayTextFromDjStream(raw)).toBe(raw);
  });

  it('fallbackStreamEndText_whenPartialExists_usesPartialText', () => {
    expect(fallbackStreamEndText('已经流出一半', '用户原话')).toBe('已经流出一半');
  });

  it('fallbackStreamEndText_whenPartialEmpty_usesUserText', () => {
    expect(fallbackStreamEndText('', '用户原话')).toBe('用户原话');
  });

  it('chatAnnouncementText_returnsFirstTwoSentences', () => {
    expect(chatAnnouncementText('第一句。第二句！第三句不会播。')).toBe('第一句。第二句');
  });

  it('chatAnnouncementText_withoutSentenceBoundary_returnsWholeText', () => {
    const longText = '没有标点'.repeat(40);

    expect(chatAnnouncementText(longText)).toBe(longText);
  });

  it('shouldAnnounceChatSpeech_onlyForSongRequestActionsWhenTtsMayRun', () => {
    expect(shouldAnnounceChatSpeech('play_search', '有内容', true)).toBe(true);
    expect(shouldAnnounceChatSpeech('chat', '有内容', true)).toBe(false);
    expect(shouldAnnounceChatSpeech('play_search', '', true)).toBe(false);
    expect(shouldAnnounceChatSpeech('play_search', '有内容', false)).toBe(false);
    expect(shouldAnnounceChatSpeech('play_search', '有内容', null)).toBe(true);
  });
});
