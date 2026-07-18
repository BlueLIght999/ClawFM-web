import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCrabInteraction } from '../hooks/useCrabInteraction.js';

// Mock context hooks
const mockSetChatOpen = vi.fn();
vi.mock('../contexts/CrabContext.jsx', () => ({
  useCrab: () => ({
    setCrabState: vi.fn(),
    isPlayingRef: { current: false },
  }),
}));
vi.mock('../contexts/ChatContext.jsx', () => ({
  useChat: () => ({
    setChatOpen: mockSetChatOpen,
  }),
}));
vi.mock('../contexts/ColdStartContext.jsx', () => ({
  useColdStart: () => ({
    coldPhase: 'loading',
    pendingSpeechRef: { current: null },
  }),
}));
vi.mock('../contexts/RadioContext.jsx', () => ({
  useRadio: () => ({
    isPlayingRef: { current: false },
  }),
}));

describe('useCrabInteraction', () => {
  const socketMock = { emit: vi.fn() };

  function renderInteraction(overrides = {}) {
    return renderHook(() => useCrabInteraction({
      socket: overrides.socket ?? socketMock,
      setDjSpeechUrl: overrides.setDjSpeechUrl ?? vi.fn(),
      ...overrides,
    }));
  }

  it('returnsHandleCrabClick_function', () => {
    const { result } = renderInteraction();
    expect(typeof result.current.handleCrabClick).toBe('function');
  });

  it('returnsHandleBubbleClick_function', () => {
    const { result } = renderInteraction();
    expect(typeof result.current.handleBubbleClick).toBe('function');
  });

  it('returnsHandleDJDialogReply_function', () => {
    const { result } = renderInteraction();
    expect(typeof result.current.handleDJDialogReply).toBe('function');
  });

  it('handleCrabClick_emitsCrabClickEvent', () => {
    const { result } = renderInteraction();
    act(() => result.current.handleCrabClick());
    expect(socketMock.emit).toHaveBeenCalledWith('crab:click', { interaction: 'chat' });
  });

  it('handleBubbleClick_emitsBubbleClickEvent', () => {
    const { result } = renderInteraction();
    act(() => result.current.handleBubbleClick({ tag: 'jazz' }));
    expect(socketMock.emit).toHaveBeenCalledWith('crab:bubble-click', { tag: 'jazz' });
  });

  it('handleBubbleClick_doesNothing_whenSocketIsNull', () => {
    const { result } = renderInteraction({ socket: null });
    expect(() => act(() => result.current.handleBubbleClick({ tag: 'jazz' }))).not.toThrow();
  });

  it('handleDJDialogReply_opensChat', () => {
    mockSetChatOpen.mockClear();
    const { result } = renderInteraction();
    act(() => result.current.handleDJDialogReply());
    expect(mockSetChatOpen).toHaveBeenCalledWith(true);
  });
});
