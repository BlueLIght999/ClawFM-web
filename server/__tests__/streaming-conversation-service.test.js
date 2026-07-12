import { describe, it, expect, vi } from 'vitest';
import { createStreamingConversationService } from '../application/services/StreamingConversationService.js';

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
        text: 'Sorry, the DJ booth is having technical difficulties. Try again later.',
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
});
