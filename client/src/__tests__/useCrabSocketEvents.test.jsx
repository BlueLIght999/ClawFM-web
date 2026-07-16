import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../contexts/CrabContext.jsx', () => ({
  useCrab: () => ({
    setCrabState: vi.fn(),
    setBubbles: vi.fn(),
    setBubblesVisible: vi.fn(),
    bubbleTimeoutRef: { current: null },
  }),
}));

vi.mock('../contexts/RadioContext.jsx', () => ({
  useRadio: () => ({ isPlayingRef: { current: false } }),
}));

import { useCrabSocketEvents } from '../hooks/useCrabSocketEvents.js';

function makeMockSocket() {
  const handlers = {};
  return {
    on: vi.fn((event, cb) => { handlers[event] = cb; }),
    off: vi.fn(),
    _handlers: handlers,
  };
}

describe('useCrabSocketEvents', () => {
  it('registers crab:bubbles handler', () => {
    const socket = makeMockSocket();
    renderHook(() => useCrabSocketEvents(socket));
    expect(socket.on).toHaveBeenCalledWith('crab:bubbles', expect.any(Function));
  });

  it('does nothing when socket is null', () => {
    const { result } = renderHook(() => useCrabSocketEvents(null));
    expect(result.current).toBeUndefined();
  });
});
