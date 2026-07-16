import { describe, it, expect, vi } from 'vitest';
import { createStreamingConversationService } from '../agent/application/services/StreamingConversationService.js';

async function* streamChunks(tokens) {
  for (const token of tokens) {
    yield { choices: [{ delta: { content: token } }] };
  }
}

async function* throwingStream() {
  yield { choices: [{ delta: { content: 'partial text' } }] };
  throw new Error('stream broke');
}

function createDeps(overrides = {}) {
  const deps = {
    chat: {
      stream: vi.fn(async () => streamChunks(['{"say":"Tonight starts here","reason":"matched"}'])),
    },
    chatHistory: {
      append: vi.fn(),
    },
    speech: {
      synthesize: vi.fn(async () => '/audio/chat.mp3'),
    },
    ttsAvailability: vi.fn(() => true),
    ...overrides,
  };
  return deps;
}

describe('StreamingConversationService', () => {
  it('streamReply_streamsTokensAndReturnsDisplayEndWithAnnouncement', async () => {
    const deps = createDeps();
    const onChunk = vi.fn();
    const service = createStreamingConversationService(deps);

    const result = await service.streamReply({
      text: 'play something',
      contextPrompt: 'ctx',
      routing: { action: 'recommend' },
      messageId: 'm1',
      onChunk,
    });

    expect(deps.chat.stream).toHaveBeenCalledWith('play something', 'ctx');
    expect(onChunk).toHaveBeenCalledWith({
      messageId: 'm1',
      token: '{"say":"Tonight starts here","reason":"matched"}',
    });
    expect(deps.chatHistory.append).toHaveBeenCalledWith('assistant', 'Tonight starts here');
    expect(result).toEqual({
      streamEnd: { messageId: 'm1', fullText: 'Tonight starts here' },
      speechAnnouncement: { text: 'Tonight starts here', type: 'chat-announce' },
    });
  });

  it('streamReply_chatActionDoesNotCreateSpeechAnnouncement', async () => {
    const deps = createDeps({
      chat: {
        stream: vi.fn(async () => streamChunks(['plain chat reply'])),
      },
    });
    const service = createStreamingConversationService(deps);

    const result = await service.streamReply({
      text: 'chat please',
      contextPrompt: 'ctx',
      routing: { action: 'chat' },
      messageId: 'm2',
      onChunk: vi.fn(),
    });

    expect(result).toEqual({
      streamEnd: { messageId: 'm2', fullText: 'plain chat reply' },
      speechAnnouncement: null,
    });
  });

  it('streamReply_noStream_returnsUnavailableMessage', async () => {
    const deps = createDeps({
      chat: {
        stream: vi.fn(async () => null),
      },
    });
    const service = createStreamingConversationService(deps);

    const result = await service.streamReply({
      text: 'anyone there',
      contextPrompt: 'ctx',
      routing: { action: 'chat' },
      messageId: 'm3',
      onChunk: vi.fn(),
    });

    expect(result).toEqual({
      unavailableMessage: {
        text: 'DJ 暂时离线，请稍后再试。',
      },
    });
    expect(deps.chatHistory.append).not.toHaveBeenCalled();
  });

  it('streamReply_streamThrows_returnsFallbackEndWithoutAppendingHistory', async () => {
    const deps = createDeps({
      chat: {
        stream: vi.fn(async () => throwingStream()),
      },
    });
    const onChunk = vi.fn();
    const service = createStreamingConversationService(deps);

    const result = await service.streamReply({
      text: 'original user text',
      contextPrompt: 'ctx',
      routing: { action: 'chat' },
      messageId: 'm4',
      onChunk,
    });

    expect(onChunk).toHaveBeenCalledWith({ messageId: 'm4', token: 'partial text' });
    expect(deps.chatHistory.append).not.toHaveBeenCalled();
    expect(result.streamEnd).toEqual({ messageId: 'm4', fullText: 'partial text' });
    expect(result.streamError.message).toBe('stream broke');
  });

  it('streamReply_mergedStream_usesDirectTokensWithoutCallingChat', async () => {
    const mergedStream = (async function* () {
      yield '你好！';
      yield '世界！';
    })();

    const deps = createDeps();
    const onChunk = vi.fn();
    const service = createStreamingConversationService(deps);

    const result = await service.streamReply({
      text: 'hi', contextPrompt: 'ctx',
      routing: { action: 'chat' },
      messageId: 'm9',
      mergedStream,
      onChunk,
    });

    expect(deps.chat.stream).not.toHaveBeenCalled();
    expect(onChunk).toHaveBeenCalledWith({ messageId: 'm9', token: '你好！' });
    expect(onChunk).toHaveBeenCalledWith({ messageId: 'm9', token: '世界！' });
    expect(result.streamEnd.fullText).toBe('你好！世界！');
  });

  it('synthesizeAnnouncement_success_returnsSpeechStartPayload', async () => {
    const deps = createDeps();
    const service = createStreamingConversationService(deps);

    const result = await service.synthesizeAnnouncement({
      text: 'announce this',
      type: 'chat-announce',
    });

    expect(deps.speech.synthesize).toHaveBeenCalledWith('announce this');
    expect(result).toEqual({
      audioUrl: '/audio/chat.mp3',
      text: 'announce this',
      type: 'chat-announce',
    });
  });

  it('synthesizeAnnouncement_missingOrFailedAudio_returnsNull', async () => {
    const deps = createDeps({
      speech: {
        synthesize: vi.fn(async () => null),
      },
    });
    const service = createStreamingConversationService(deps);

    await expect(service.synthesizeAnnouncement(null)).resolves.toBeNull();
    await expect(service.synthesizeAnnouncement({ text: 'announce this', type: 'chat-announce' })).resolves.toBeNull();
  });

  // --- Incremental TTS tests ---

  it('streamReplyWithIncrementalTts_synthesizesEachSentence', async () => {
    const deps = createDeps({
      chat: {
        stream: vi.fn(async () => streamChunks(['你好。', '世界！'])),
      },
      speech: { synthesize: vi.fn(async (t) => `/audio/${t}.mp3`) },
    });
    const onChunk = vi.fn();
    const onSpeechSegment = vi.fn();
    const service = createStreamingConversationService(deps);

    const result = await service.streamReplyWithIncrementalTts({
      text: 'hi', contextPrompt: 'ctx', routing: { action: 'chat' },
      messageId: 'm5', onChunk, onSpeechSegment,
    });

    expect(deps.speech.synthesize).toHaveBeenCalledTimes(2);
    expect(deps.speech.synthesize).toHaveBeenCalledWith('你好。');
    expect(deps.speech.synthesize).toHaveBeenCalledWith('世界！');
    expect(onSpeechSegment).toHaveBeenCalledTimes(2);
    expect(result.speechSegmentCount).toBe(2);
    expect(result.streamEnd.fullText).toBe('你好。世界！');
  });

  it('streamReplyWithIncrementalTts_flushesRemainingText', async () => {
    const deps = createDeps({
      chat: {
        stream: vi.fn(async () => streamChunks(['第一句。', '没有标点的尾巴'])),
      },
      speech: { synthesize: vi.fn(async (t) => `/audio/${t}.mp3`) },
    });
    const service = createStreamingConversationService(deps);

    const result = await service.streamReplyWithIncrementalTts({
      text: 'hi', contextPrompt: 'ctx', routing: { action: 'chat' },
      messageId: 'm6',
    });

    expect(deps.speech.synthesize).toHaveBeenCalledTimes(2);
    expect(deps.speech.synthesize).toHaveBeenLastCalledWith('没有标点的尾巴');
    expect(result.speechSegmentCount).toBe(2);
  });

  it('streamReplyWithIncrementalTts_mergedStream_usesDirectTokens', async () => {
    const mergedStream = (async function* () {
      yield '你好。';
      yield '世界！';
    })();

    const deps = createDeps();
    const service = createStreamingConversationService(deps);

    const result = await service.streamReplyWithIncrementalTts({
      text: 'hi', contextPrompt: 'ctx', routing: { action: 'chat' },
      messageId: 'm7', mergedStream,
    });

    expect(deps.chat.stream).not.toHaveBeenCalled();
    expect(result.speechSegmentCount).toBe(2);
  });

  it('streamReplyWithIncrementalTts_ttsFailure_doesNotBreakStream', async () => {
    const deps = createDeps({
      chat: {
        stream: vi.fn(async () => streamChunks(['第一句。', '第二句！'])),
      },
      speech: { synthesize: vi.fn(async () => { throw new Error('TTS down'); }) },
    });
    const service = createStreamingConversationService(deps);

    const result = await service.streamReplyWithIncrementalTts({
      text: 'hi', contextPrompt: 'ctx', routing: { action: 'chat' },
      messageId: 'm8',
    });

    expect(result.streamEnd.fullText).toBe('第一句。第二句！');
    expect(result.speechSegmentCount).toBe(2);
  });
});
