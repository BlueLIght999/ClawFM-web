import { describe, it, expect, vi } from 'vitest';

/**
 * TDD RED: Test filterRecentConversations and onNewConnection
 * chat history emission.
 *
 * filterRecentConversations: extracts last N assistant messages and
 * their paired user messages from chat history.
 *
 * onNewConnection: should emit chat:history event with recent
 * conversations when chatHistory is available in deps.
 */

describe('filterRecentConversations', () => {
  it('returns empty array for empty history', async () => {
    const { filterRecentConversations } = await import('../socket/chatHistoryFilter.js');
    expect(filterRecentConversations([], 3)).toEqual([]);
  });

  it('returns all messages when fewer than N assistant messages', async () => {
    const { filterRecentConversations } = await import('../socket/chatHistoryFilter.js');
    const history = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ];
    const result = filterRecentConversations(history, 3);
    expect(result).toEqual(history);
  });

  it('returns last 3 assistant messages and paired user messages', async () => {
    const { filterRecentConversations } = await import('../socket/chatHistoryFilter.js');
    const history = [
      { role: 'user', content: 'msg1' },
      { role: 'assistant', content: 'reply1' },
      { role: 'user', content: 'msg2' },
      { role: 'assistant', content: 'reply2' },
      { role: 'user', content: 'msg3' },
      { role: 'assistant', content: 'reply3' },
      { role: 'user', content: 'msg4' },
      { role: 'assistant', content: 'reply4' },
    ];
    const result = filterRecentConversations(history, 3);
    // Should return last 3 pairs: msg2/reply2, msg3/reply3, msg4/reply4
    expect(result).toHaveLength(6);
    expect(result[0]).toEqual({ role: 'user', content: 'msg2' });
    expect(result[5]).toEqual({ role: 'assistant', content: 'reply4' });
  });

  it('handles history with only user messages', async () => {
    const { filterRecentConversations } = await import('../socket/chatHistoryFilter.js');
    const history = [
      { role: 'user', content: 'msg1' },
      { role: 'user', content: 'msg2' },
    ];
    const result = filterRecentConversations(history, 3);
    // No assistant messages — returns empty (no complete conversations)
    expect(result).toEqual([]);
  });

  it('handles null/undefined history', async () => {
    const { filterRecentConversations } = await import('../socket/chatHistoryFilter.js');
    expect(filterRecentConversations(null, 3)).toEqual([]);
    expect(filterRecentConversations(undefined, 3)).toEqual([]);
  });
});

describe('onNewConnection chat history', () => {
  it('emits chat:history event with recent conversations', async () => {
    const { onNewConnection } = await import('../socket/connectionHandler.js');

    const emitCalls = [];
    const socket = {
      id: 'test-socket-id',
      emit: vi.fn((event, data) => emitCalls.push({ event, data })),
    };

    const chatHistoryData = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
      { role: 'user', content: 'play jazz' },
      { role: 'assistant', content: 'sure, playing jazz' },
    ];

    const deps = {
      getConnectedClients: () => 0,
      setConnectedClients: () => {},
      scheduler: {
        coldStartState: 'idle',
        isPlaying: false,
        pause: () => {},
        playhead: { currentSong: null, isPlaying: false },
        getState: () => ({ currentSong: null, startedAt: null, isPlaying: false, audioUrl: null }),
        getAudioUrl: async () => null,
      },
      getPlan: () => null,
      speechSynthAdapter: { health: () => ({ available: true, provider: 'test' }) },
      metricsCollector: { connectedClients: { set: () => {} } },
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      chatHistory: {
        recent: vi.fn(() => chatHistoryData),
        append: vi.fn(),
      },
    };

    await onNewConnection({}, socket, deps);

    // Verify chat:history was emitted
    const historyEmit = emitCalls.find(c => c.event === 'chat:history');
    expect(historyEmit).toBeTruthy();
    expect(historyEmit.data.messages).toBeDefined();
    expect(historyEmit.data.messages.length).toBeGreaterThan(0);
  });

  it('does not emit chat:history when chatHistory is not available', async () => {
    const { onNewConnection } = await import('../socket/connectionHandler.js');

    const emitCalls = [];
    const socket = {
      id: 'test-socket-id',
      emit: vi.fn((event, data) => emitCalls.push({ event, data })),
    };

    const deps = {
      getConnectedClients: () => 0,
      setConnectedClients: () => {},
      scheduler: {
        coldStartState: 'idle',
        isPlaying: false,
        pause: () => {},
        playhead: { currentSong: null, isPlaying: false },
        getState: () => ({ currentSong: null, startedAt: null, isPlaying: false, audioUrl: null }),
        getAudioUrl: async () => null,
      },
      getPlan: () => null,
      speechSynthAdapter: { health: () => ({ available: true, provider: 'test' }) },
      metricsCollector: { connectedClients: { set: () => {} } },
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      // No chatHistory in deps
    };

    await onNewConnection({}, socket, deps);

    const historyEmit = emitCalls.find(c => c.event === 'chat:history');
    expect(historyEmit).toBeUndefined();
  });
});
