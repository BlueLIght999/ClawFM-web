import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

/**
 * TDD RED: Test useChatHistory hook — manages chat message state
 * with localStorage persistence and server chat:history event handling.
 *
 * The hook should:
 * 1. Initialize from localStorage (instant display on refresh)
 * 2. Listen for chat:history socket event (server authoritative)
 * 3. Auto-save to localStorage (capped at 10 messages)
 */

describe('useChatHistory', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('initializes from localStorage', async () => {
    const saved = JSON.stringify([
      { id: '1', role: 'user', content: 'hello' },
      { id: '2', role: 'assistant', content: 'hi there' },
    ]);
    localStorage.setItem('clawfm_chat_history', saved);

    const socket = { on: vi.fn(), off: vi.fn() };
    const { result } = await import('../hooks/useChatHistory.js').then(m => {
      return renderHook(() => m.useChatHistory(socket));
    });

    expect(result.current[0]).toHaveLength(2);
    expect(result.current[0][0].content).toBe('hello');
  });

  it('starts empty when localStorage is empty', async () => {
    const socket = { on: vi.fn(), off: vi.fn() };
    const { result } = await import('../hooks/useChatHistory.js').then(m => {
      return renderHook(() => m.useChatHistory(socket));
    });

    expect(result.current[0]).toEqual([]);
  });

  it('handles chat:history event from server', async () => {
    const socket = { on: vi.fn(), off: vi.fn() };
    const { result } = await import('../hooks/useChatHistory.js').then(m => {
      return renderHook(() => m.useChatHistory(socket));
    });

    // Find the chat:history handler
    const historyCall = socket.on.mock.calls.find(c => c[0] === 'chat:history');
    expect(historyCall).toBeTruthy();

    // Simulate server sending history
    act(() => {
      historyCall[1]({ messages: [
        { role: 'user', content: 'old msg' },
        { role: 'assistant', content: 'old reply' },
      ]});
    });

    expect(result.current[0]).toHaveLength(2);
    expect(result.current[0][0].content).toBe('old msg');
    expect(result.current[0][1].content).toBe('old reply');
  });

  it('saves to localStorage when messages change', async () => {
    const socket = { on: vi.fn(), off: vi.fn() };
    const { result } = await import('../hooks/useChatHistory.js').then(m => {
      return renderHook(() => m.useChatHistory(socket));
    });

    act(() => {
      result.current[1]([{ id: '1', role: 'user', content: 'test msg' }]);
    });

    const saved = JSON.parse(localStorage.getItem('clawfm_chat_history'));
    expect(saved).toHaveLength(1);
    expect(saved[0].content).toBe('test msg');
  });

  it('limits localStorage to 10 messages', async () => {
    const socket = { on: vi.fn(), off: vi.fn() };
    const { result } = await import('../hooks/useChatHistory.js').then(m => {
      return renderHook(() => m.useChatHistory(socket));
    });

    const messages = Array.from({ length: 15 }, (_, i) => ({
      id: `msg-${i}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `message ${i}`,
    }));

    act(() => {
      result.current[1](messages);
    });

    const saved = JSON.parse(localStorage.getItem('clawfm_chat_history'));
    expect(saved).toHaveLength(10);
    expect(saved[9].content).toBe('message 14');
  });

  it('removes chat:history listener on unmount', async () => {
    const socket = { on: vi.fn(), off: vi.fn() };
    const { unmount } = await import('../hooks/useChatHistory.js').then(m => {
      return renderHook(() => m.useChatHistory(socket));
    });

    unmount();

    expect(socket.off).toHaveBeenCalledWith('chat:history', expect.any(Function));
  });
});
