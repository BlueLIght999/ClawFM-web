import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../contexts/RadioContext.jsx', () => ({
  useRadio: () => ({
    setRadioState: vi.fn(),
    updateRadioState: vi.fn(),
    isPlayingRef: { current: false },
  }),
}));

vi.mock('../contexts/ColdStartContext.jsx', () => ({
  useColdStart: () => ({
    coldPhaseRef: { current: 'loading' },
    setColdPhase: vi.fn(),
  }),
}));

vi.mock('../contexts/CrabContext.jsx', () => ({
  useCrab: () => ({
    setCrabState: vi.fn(),
  }),
}));

import { useRadioSocketEvents } from '../hooks/useRadioSocketEvents.js';

function makeMockSocket() {
  const handlers = {};
  return {
    on: vi.fn((event, cb) => { handlers[event] = cb; }),
    off: vi.fn(),
    emit: vi.fn(),
    _handlers: handlers,
  };
}

describe('useRadioSocketEvents', () => {
  it('registers radio:state-v2 handler', () => {
    const socket = makeMockSocket();
    renderHook(() => useRadioSocketEvents(socket, { current: null }));
    expect(socket.on).toHaveBeenCalledWith('radio:state-v2', expect.any(Function));
  });

  it('registers radio:song-change-v2 handler', () => {
    const socket = makeMockSocket();
    renderHook(() => useRadioSocketEvents(socket, { current: null }));
    expect(socket.on).toHaveBeenCalledWith('radio:song-change-v2', expect.any(Function));
  });

  it('registers radio:queue-update-v2 handler', () => {
    const socket = makeMockSocket();
    renderHook(() => useRadioSocketEvents(socket, { current: null }));
    expect(socket.on).toHaveBeenCalledWith('radio:queue-update-v2', expect.any(Function));
  });

  it('registers radio:pause handler', () => {
    const socket = makeMockSocket();
    renderHook(() => useRadioSocketEvents(socket, { current: null }));
    expect(socket.on).toHaveBeenCalledWith('radio:pause', expect.any(Function));
  });

  it('registers radio:resume handler', () => {
    const socket = makeMockSocket();
    renderHook(() => useRadioSocketEvents(socket, { current: null }));
    expect(socket.on).toHaveBeenCalledWith('radio:resume', expect.any(Function));
  });

  it('does nothing when socket is null', () => {
    const { result } = renderHook(() => useRadioSocketEvents(null, { current: null }));
    expect(result.current.pendingSongChangeRef).toBeDefined();
  });
});
