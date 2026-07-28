import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCommunitySocketEvents } from '../hooks/useCommunitySocketEvents.js';

// mock CommunityContext：把 6 个 handler 捕获到 mock fn，便于断言
const handlers = {
  onPostNew: vi.fn(),
  onAgentComment: vi.fn(),
  onPush: vi.fn(),
  onClusterUpdated: vi.fn(),
  onInvitation: vi.fn(),
  onRoomState: vi.fn(),
};

vi.mock('../contexts/CommunityContext.jsx', () => ({
  useCommunity: () => handlers,
}));

// mock socket：捕获 on/off 调用，并暴露 _handlers 供测试触发
function makeMockSocket() {
  const onCalls = [];
  const offCalls = [];
  const registered = {};
  return {
    on: vi.fn((event, cb) => {
      onCalls.push(event);
      registered[event] = cb;
    }),
    off: vi.fn((event) => offCalls.push(event)),
    emit: vi.fn(),
    _onCalls: onCalls,
    _offCalls: offCalls,
    _handlers: registered,
  };
}

describe('useCommunitySocketEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers 6 community event listeners when socket is provided', () => {
    const socket = makeMockSocket();
    renderHook(() => useCommunitySocketEvents(socket));

    expect(socket.on).toHaveBeenCalledWith('community:post-new', expect.any(Function));
    expect(socket.on).toHaveBeenCalledWith('community:agent-comment', expect.any(Function));
    expect(socket.on).toHaveBeenCalledWith('community:push', expect.any(Function));
    expect(socket.on).toHaveBeenCalledWith('community:cluster-updated', expect.any(Function));
    expect(socket.on).toHaveBeenCalledWith('community:invitation', expect.any(Function));
    expect(socket.on).toHaveBeenCalledWith('room:state', expect.any(Function));
    expect(socket.on).toHaveBeenCalledTimes(6);
  });

  it('cleanup removes all 6 listeners (no removeAllListeners)', () => {
    const socket = makeMockSocket();
    const { unmount } = renderHook(() => useCommunitySocketEvents(socket));

    unmount();

    expect(socket.off).toHaveBeenCalledWith('community:post-new');
    expect(socket.off).toHaveBeenCalledWith('community:agent-comment');
    expect(socket.off).toHaveBeenCalledWith('community:push');
    expect(socket.off).toHaveBeenCalledWith('community:cluster-updated');
    expect(socket.off).toHaveBeenCalledWith('community:invitation');
    expect(socket.off).toHaveBeenCalledWith('room:state');
    expect(socket.off).toHaveBeenCalledTimes(6);
  });

  it('socket null — no registration, no throw', () => {
    expect(() => renderHook(() => useCommunitySocketEvents(null))).not.toThrow();
  });

  it('incoming community:post-new event routes to onPostNew handler', () => {
    const socket = makeMockSocket();
    renderHook(() => useCommunitySocketEvents(socket));

    const post = { id: 1, content: 'hi' };
    socket._handlers['community:post-new'](post);

    expect(handlers.onPostNew).toHaveBeenCalledWith(post);
  });

  it('incoming community:agent-comment event routes to onAgentComment', () => {
    const socket = makeMockSocket();
    renderHook(() => useCommunitySocketEvents(socket));

    const payload = { postId: 1, commentId: 9, agentAuthorUserId: 'u2' };
    socket._handlers['community:agent-comment'](payload);

    expect(handlers.onAgentComment).toHaveBeenCalledWith(payload);
  });

  it('incoming community:push event routes to onPush', () => {
    const socket = makeMockSocket();
    renderHook(() => useCommunitySocketEvents(socket));

    const payload = { targetType: 'song', targetId: 's1' };
    socket._handlers['community:push'](payload);

    expect(handlers.onPush).toHaveBeenCalledWith(payload);
  });

  it('incoming community:cluster-updated event routes to onClusterUpdated', () => {
    const socket = makeMockSocket();
    renderHook(() => useCommunitySocketEvents(socket));

    const payload = { userId: 'u1', clusterId: 3, label: 'rock' };
    socket._handlers['community:cluster-updated'](payload);

    expect(handlers.onClusterUpdated).toHaveBeenCalledWith(payload);
  });

  it('incoming community:invitation event routes to onInvitation', () => {
    const socket = makeMockSocket();
    renderHook(() => useCommunitySocketEvents(socket));

    const payload = { fromUserId: 'u2' };
    socket._handlers['community:invitation'](payload);

    expect(handlers.onInvitation).toHaveBeenCalledWith(payload);
  });

  it('re-subscribes when socket changes (old listeners off, new on)', () => {
    const socket1 = makeMockSocket();
    const { rerender } = renderHook(({ s }) => useCommunitySocketEvents(s), {
      initialProps: { s: socket1 },
    });

    const socket2 = makeMockSocket();
    rerender({ s: socket2 });

    // 旧 socket 的 6 个 listener 被解绑
    expect(socket1.off).toHaveBeenCalledTimes(6);
    // 新 socket 注册了 6 个 listener
    expect(socket2.on).toHaveBeenCalledTimes(6);
  });
});
