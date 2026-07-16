import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({ setLoggedIn: vi.fn() }),
}));

vi.mock('../contexts/UIContext.jsx', () => ({
  useUI: () => ({
    setPlan: vi.fn(),
    setError: vi.fn(),
    setTtsStatus: vi.fn(),
  }),
}));

vi.mock('../contexts/ColdStartContext.jsx', () => ({
  useColdStart: () => ({
    setColdPhaseText: vi.fn(),
    setColdOpenText: vi.fn(),
  }),
}));

import { useSystemSocketEvents } from '../hooks/useSystemSocketEvents.js';

function makeMockSocket() {
  const handlers = {};
  return {
    on: vi.fn((event, cb) => { handlers[event] = cb; }),
    off: vi.fn(),
    _handlers: handlers,
  };
}

describe('useSystemSocketEvents', () => {
  it('registers radio:login-required handler', () => {
    const socket = makeMockSocket();
    renderHook(() => useSystemSocketEvents(socket));
    expect(socket.on).toHaveBeenCalledWith('radio:login-required', expect.any(Function));
  });

  it('registers plan:update handler', () => {
    const socket = makeMockSocket();
    renderHook(() => useSystemSocketEvents(socket));
    expect(socket.on).toHaveBeenCalledWith('plan:update', expect.any(Function));
  });

  it('registers radio:error handler', () => {
    const socket = makeMockSocket();
    renderHook(() => useSystemSocketEvents(socket));
    expect(socket.on).toHaveBeenCalledWith('radio:error', expect.any(Function));
  });

  it('registers auth:login-success handler', () => {
    const socket = makeMockSocket();
    renderHook(() => useSystemSocketEvents(socket));
    expect(socket.on).toHaveBeenCalledWith('auth:login-success', expect.any(Function));
  });

  it('registers tts:status handler', () => {
    const socket = makeMockSocket();
    renderHook(() => useSystemSocketEvents(socket));
    expect(socket.on).toHaveBeenCalledWith('tts:status', expect.any(Function));
  });
});
