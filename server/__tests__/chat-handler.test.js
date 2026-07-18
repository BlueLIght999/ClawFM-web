import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../socket/emitHelpers.js', () => ({
  emitConversationResult: vi.fn(),
  emitStreamingConversationResult: vi.fn(),
  emitDashboardEvent: vi.fn(),
}));

import { handleChatMessage, startChatAnnouncement, emitChatTurnResults } from '../socket/chatHandler.js';

describe('chatHandler — startChatAnnouncement', () => {
  it('doesNothing_whenNoSpeechAnnouncement', async () => {
    const io = { emit: vi.fn() };
    const deps = { streamingConversationService: { synthesizeAnnouncement: vi.fn() }, resetLastSpeechTime: vi.fn() };
    await startChatAnnouncement(io, null, deps);
    expect(deps.streamingConversationService.synthesizeAnnouncement).not.toHaveBeenCalled();
  });

  it('synthesizesAndEmits_whenSpeechAnnouncement', async () => {
    const io = { emit: vi.fn() };
    const deps = {
      streamingConversationService: { synthesizeAnnouncement: vi.fn().mockResolvedValue('url.mp3') },
      resetLastSpeechTime: vi.fn(),
    };
    await startChatAnnouncement(io, { speechAnnouncement: { text: 'hello' } }, deps);
    expect(deps.streamingConversationService.synthesizeAnnouncement).toHaveBeenCalledWith({ text: 'hello' });
    expect(io.emit).toHaveBeenCalledWith('radio:dj-speech-start', 'url.mp3');
    expect(deps.resetLastSpeechTime).toHaveBeenCalled();
  });

  it('doesNotEmit_whenSynthesizeReturnsNull', async () => {
    const io = { emit: vi.fn() };
    const deps = {
      streamingConversationService: { synthesizeAnnouncement: vi.fn().mockResolvedValue(null) },
      resetLastSpeechTime: vi.fn(),
    };
    await startChatAnnouncement(io, { speechAnnouncement: { text: 'hello' } }, deps);
    expect(io.emit).not.toHaveBeenCalled();
  });
});

describe('chatHandler — emitChatTurnResults', () => {
  it('emitsConversationResults_andQueueUpdate', () => {
    const io = { emit: vi.fn() };
    const socket = {};
    const turnResult = {
      conversationResults: [{ type: 'msg', text: 'hi' }],
      queueUpdate: { upcomingSongs: [] },
    };
    emitChatTurnResults(io, socket, turnResult);
    expect(io.emit).toHaveBeenCalledWith('radio:queue-update', { upcomingSongs: [] });
  });

  it('doesNotEmitQueueUpdate_whenAbsent', () => {
    const io = { emit: vi.fn() };
    emitChatTurnResults(io, {}, { conversationResults: [] });
    expect(io.emit).not.toHaveBeenCalled();
  });
});

describe('chatHandler — handleChatMessage', () => {
  let io, socket, deps;

  beforeEach(() => {
    io = { emit: vi.fn() };
    socket = { emit: vi.fn() };
    deps = {
      agentLoopService: { handleMessage: vi.fn() },
      streamingConversationService: { streamReply: vi.fn() },
      llmAdapter: { isConfigured: vi.fn(() => true) },
      metricsCollector: { chatMessages: { inc: vi.fn() } },
      chatHistory: { append: vi.fn() },
      resetLastSpeechTime: vi.fn(),
    };
  });

  it('appendsUserMessage_toChatHistory', async () => {
    deps.agentLoopService.handleMessage.mockResolvedValue({ unavailableMessage: null, routing: {}, conversationResults: [], snapshot: {} });
    await handleChatMessage('hello', io, socket, deps);
    expect(deps.chatHistory.append).toHaveBeenCalledWith('user', 'hello');
  });

  it('emitsUnavailableMessage_whenServiceUnavailable', async () => {
    deps.agentLoopService.handleMessage.mockResolvedValue({
      unavailableMessage: { text: 'DJ unavailable' },
      snapshot: {},
    });
    await handleChatMessage('hi', io, socket, deps);
    expect(socket.emit).toHaveBeenCalledWith('radio:dj-message', { text: 'DJ unavailable' });
  });

  it('returnsEarly_whenHandledAndNoStreamRequest', async () => {
    deps.agentLoopService.handleMessage.mockResolvedValue({
      handled: true,
      streamRequest: null,
      routing: {},
      conversationResults: [],
      snapshot: {},
    });
    await handleChatMessage('skip', io, socket, deps);
    expect(deps.streamingConversationService.streamReply).not.toHaveBeenCalled();
  });

  it('streamsReply_whenStreamRequestPresent', async () => {
    deps.agentLoopService.handleMessage.mockResolvedValue({
      handled: false,
      streamRequest: { text: 'tell me about jazz' },
      routing: {},
      conversationResults: [],
      snapshot: {},
    });
    deps.streamingConversationService.streamReply.mockResolvedValue({ streamError: null });
    await handleChatMessage('tell me about jazz', io, socket, deps);
    expect(deps.streamingConversationService.streamReply).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'tell me about jazz' }),
    );
  });

  it('doesNotCrash_onEmptyText', async () => {
    deps.agentLoopService.handleMessage.mockResolvedValue({
      unavailableMessage: null, routing: {}, conversationResults: [], snapshot: {},
    });
    await handleChatMessage('', io, socket, deps);
    expect(deps.agentLoopService.handleMessage).toHaveBeenCalled();
  });
});
