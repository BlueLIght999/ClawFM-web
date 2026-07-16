import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../contexts/ChatContext.jsx', () => ({
  useChat: () => ({
    addDJMessage: vi.fn(),
    showDJMessage: vi.fn(),
    appendDJStreamChunk: vi.fn(),
    endDJStream: vi.fn(),
  }),
}));

vi.mock('../contexts/CrabContext.jsx', () => ({
  useCrab: () => ({ setCrabState: vi.fn() }),
}));

vi.mock('../contexts/RadioContext.jsx', () => ({
  useRadio: () => ({ isPlayingRef: { current: false } }),
}));

vi.mock('../contexts/ColdStartContext.jsx', () => ({
  useColdStart: () => ({ setColdPhase: vi.fn() }),
}));

import { useChatSocketEvents } from '../hooks/useChatSocketEvents.js';

function makeMockSocket() {
  const handlers = {};
  return {
    on: vi.fn((event, cb) => { handlers[event] = cb; }),
    off: vi.fn(),
    _handlers: handlers,
  };
}

describe('useChatSocketEvents', () => {
  it('registers radio:dj-message handler', () => {
    const socket = makeMockSocket();
    renderHook(() => useChatSocketEvents(socket, { current: null }, { current: 'transition' }, vi.fn(), { current: null }));
    expect(socket.on).toHaveBeenCalledWith('radio:dj-message', expect.any(Function));
  });

  it('registers radio:dj-speech-start handler', () => {
    const socket = makeMockSocket();
    renderHook(() => useChatSocketEvents(socket, { current: null }, { current: 'transition' }, vi.fn(), { current: null }));
    expect(socket.on).toHaveBeenCalledWith('radio:dj-speech-start', expect.any(Function));
  });

  it('registers radio:dj-speech-end handler', () => {
    const socket = makeMockSocket();
    renderHook(() => useChatSocketEvents(socket, { current: null }, { current: 'transition' }, vi.fn(), { current: null }));
    expect(socket.on).toHaveBeenCalledWith('radio:dj-speech-end', expect.any(Function));
  });

  it('registers radio:dj-stream-chunk handler', () => {
    const socket = makeMockSocket();
    renderHook(() => useChatSocketEvents(socket, { current: null }, { current: 'transition' }, vi.fn(), { current: null }));
    expect(socket.on).toHaveBeenCalledWith('radio:dj-stream-chunk', expect.any(Function));
  });

  it('registers radio:dj-stream-end handler', () => {
    const socket = makeMockSocket();
    renderHook(() => useChatSocketEvents(socket, { current: null }, { current: 'transition' }, vi.fn(), { current: null }));
    expect(socket.on).toHaveBeenCalledWith('radio:dj-stream-end', expect.any(Function));
  });
});
