import { describe, it, expect, vi } from 'vitest';
import { createStreamingConversationService } from '../application/services/StreamingConversationService.js';

async function* streamChunks(tokens) {
  for (const token of tokens) {
    yield { choices: [{ delta: { content: token } }] };
  }
}

async function* throwingStream() {
  yield { choices: [{ delta: { content: '已经流出一半' } }] };
  throw new Error('stream broke');
}

function createDeps(overrides = {}) {
  const deps = {
    chatWithDj: vi.fn(async () => streamChunks(['{"say":"今晚从这首开始","reason":"matched"}'])),
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
      text: '来点推荐',
      contextPrompt: 'ctx',
      routing: { action: 'recommend' },
      messageId: 'm1',
      onChunk,
    });

    expect(deps.chatWithDj).toHaveBeenCalledWith('来点推荐', 'ctx');
    expect(onChunk).toHaveBeenCalledWith({
      messageId: 'm1',
      token: '{"say":"今晚从这首开始","reason":"matched"}',
    });
    expect(deps.chatHistory.append).toHaveBeenCalledWith('assistant', '今晚从这首开始');
    expect(result).toEqual({
      streamEnd: { messageId: 'm1', fullText: '今晚从这首开始' },
      speechAnnouncement: { text: '今晚从这首开始', type: 'chat-announce' },
    });
  });

  it('streamReply_chatActionDoesNotCreateSpeechAnnouncement', async () => {
    const deps = createDeps({
      chatWithDj: vi.fn(async () => streamChunks(['普通聊天回复'])),
    });
    const service = createStreamingConversationService(deps);

    const result = await service.streamReply({
      text: '聊聊天',
      contextPrompt: 'ctx',
      routing: { action: 'chat' },
      messageId: 'm2',
      onChunk: vi.fn(),
    });

    expect(result).toEqual({
      streamEnd: { messageId: 'm2', fullText: '普通聊天回复' },
      speechAnnouncement: null,
    });
  });

  it('streamReply_noStream_returnsUnavailableMessage', async () => {
    const deps = createDeps({
      chatWithDj: vi.fn(async () => null),
    });
    const service = createStreamingConversationService(deps);

    const result = await service.streamReply({
      text: '有人吗',
      contextPrompt: 'ctx',
      routing: { action: 'chat' },
      messageId: 'm3',
      onChunk: vi.fn(),
    });

    expect(result).toEqual({
      unavailableMessage: {
        text: 'Sorry, the DJ booth is having technical difficulties. Try again later.',
      },
    });
    expect(deps.chatHistory.append).not.toHaveBeenCalled();
  });

  it('streamReply_streamThrows_returnsFallbackEndWithoutAppendingHistory', async () => {
    const deps = createDeps({
      chatWithDj: vi.fn(async () => throwingStream()),
    });
    const onChunk = vi.fn();
    const service = createStreamingConversationService(deps);

    const result = await service.streamReply({
      text: '用户原话',
      contextPrompt: 'ctx',
      routing: { action: 'chat' },
      messageId: 'm4',
      onChunk,
    });

    expect(onChunk).toHaveBeenCalledWith({ messageId: 'm4', token: '已经流出一半' });
    expect(deps.chatHistory.append).not.toHaveBeenCalled();
    expect(result.streamEnd).toEqual({ messageId: 'm4', fullText: '已经流出一半' });
    expect(result.streamError.message).toBe('stream broke');
  });

  it('synthesizeAnnouncement_success_returnsSpeechStartPayload', async () => {
    const deps = createDeps();
    const service = createStreamingConversationService(deps);

    const result = await service.synthesizeAnnouncement({
      text: '播报一下',
      type: 'chat-announce',
    });

    expect(deps.speech.synthesize).toHaveBeenCalledWith('播报一下');
    expect(result).toEqual({
      audioUrl: '/audio/chat.mp3',
      text: '播报一下',
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
    await expect(service.synthesizeAnnouncement({ text: '播报一下', type: 'chat-announce' })).resolves.toBeNull();
  });
});
