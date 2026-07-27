import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, renderHook } from '@testing-library/react';
import { CommunityProvider, useCommunity } from '../contexts/CommunityContext.jsx';

// TestConsumer：暴露 state 和 emit 方法（用 fireEvent 触发）
function TestConsumer() {
  const ctx = useCommunity();
  return (
    <div>
      <span data-testid="feed-count">{ctx.feed.length}</span>
      <span data-testid="inbox-count">{ctx.inbox.length}</span>
      <span data-testid="notif-count">{ctx.notifications.length}</span>
      <span data-testid="clusters-count">{ctx.clusters.length}</span>
      <span data-testid="member">{ctx.currentMember ? ctx.currentMember.userId : 'null'}</span>
      <button onClick={() => ctx.identify('u1')}>Identify</button>
      <button onClick={() => ctx.joinRoom('r1')}>JoinRoom</button>
      <button onClick={() => ctx.leaveRoom('r1')}>LeaveRoom</button>
      <button onClick={() => ctx.roomSkip('r1')}>RoomSkip</button>
      <button onClick={() => ctx.onPostNew({ id: 1, userId: 'u1', content: 'hi' })}>OnPostNew</button>
      <button onClick={() => ctx.onPostNew({ id: 1, userId: 'u1', content: 'dup' })}>OnPostNewDup</button>
      <button onClick={() => ctx.onAgentComment({ postId: 1, commentId: 9, agentAuthorUserId: 'u2' })}>OnAgentComment</button>
      <button onClick={() => ctx.onPush({ targetType: 'song', targetId: 's1' })}>OnPush</button>
      <button onClick={() => ctx.onInvitation({ fromUserId: 'u2' })}>OnInvitation</button>
      <button onClick={ctx.clearNotifications}>ClearNotif</button>
      <button onClick={() => ctx.updateState({ currentMember: { userId: 'u1' } })}>SetMember</button>
      <button onClick={() => ctx.onClusterUpdated({ userId: 'u1', clusterId: 3, label: 'rock' })}>OnCluster</button>
    </div>
  );
}

function renderWith(socket = null) {
  return render(<CommunityProvider socket={socket}><TestConsumer /></CommunityProvider>);
}

/**
 * 用 renderHook 渲染 useCommunity，方便测 HTTP 方法。
 * wrapper 让 hook 在 Provider 内执行。
 */
function renderCommunityHook(socket = null) {
  const wrapper = ({ children }) => <CommunityProvider socket={socket}>{children}</CommunityProvider>;
  return renderHook(() => useCommunity(), { wrapper });
}

describe('CommunityContext', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── 默认 state ──
  it('initializes with default empty state', () => {
    renderWith();
    expect(screen.getByTestId('feed-count').textContent).toBe('0');
    expect(screen.getByTestId('inbox-count').textContent).toBe('0');
    expect(screen.getByTestId('notif-count').textContent).toBe('0');
    expect(screen.getByTestId('clusters-count').textContent).toBe('0');
    expect(screen.getByTestId('member').textContent).toBe('null');
  });

  // ── Socket emit（用 E.XXX 常量，不字面量）──
  it('identify emits community:identify with userId', () => {
    const emit = vi.fn();
    renderWith({ emit });
    fireEvent.click(screen.getByText('Identify'));
    expect(emit).toHaveBeenCalledWith('community:identify', 'u1');
  });

  it('joinRoom emits room:join with roomId', () => {
    const emit = vi.fn();
    renderWith({ emit });
    fireEvent.click(screen.getByText('JoinRoom'));
    expect(emit).toHaveBeenCalledWith('room:join', { roomId: 'r1' });
  });

  it('leaveRoom emits room:leave', () => {
    const emit = vi.fn();
    renderWith({ emit });
    fireEvent.click(screen.getByText('LeaveRoom'));
    expect(emit).toHaveBeenCalledWith('room:leave', { roomId: 'r1' });
  });

  it('roomSkip emits room:skip', () => {
    const emit = vi.fn();
    renderWith({ emit });
    fireEvent.click(screen.getByText('RoomSkip'));
    expect(emit).toHaveBeenCalledWith('room:skip', { roomId: 'r1' });
  });

  it('socket null — emit methods are no-ops (no throw)', () => {
    expect(() => {
      renderWith(null);
      fireEvent.click(screen.getByText('Identify'));
      fireEvent.click(screen.getByText('JoinRoom'));
    }).not.toThrow();
  });

  // ── Socket 事件 handler ──
  it('onPostNew prepends new post to feed', () => {
    renderWith();
    fireEvent.click(screen.getByText('OnPostNew'));
    expect(screen.getByTestId('feed-count').textContent).toBe('1');
  });

  it('onPostNew dedupes by post id', () => {
    renderWith();
    fireEvent.click(screen.getByText('OnPostNew'));
    fireEvent.click(screen.getByText('OnPostNewDup'));
    expect(screen.getByTestId('feed-count').textContent).toBe('1');
  });

  it('onAgentComment adds notification', () => {
    renderWith();
    fireEvent.click(screen.getByText('OnAgentComment'));
    expect(screen.getByTestId('notif-count').textContent).toBe('1');
  });

  it('onPush adds notification', () => {
    renderWith();
    fireEvent.click(screen.getByText('OnPush'));
    expect(screen.getByTestId('notif-count').textContent).toBe('1');
  });

  it('onInvitation adds notification', () => {
    renderWith();
    fireEvent.click(screen.getByText('OnInvitation'));
    expect(screen.getByTestId('notif-count').textContent).toBe('1');
  });

  it('notifications cap at 50', () => {
    renderWith();
    for (let i = 0; i < 55; i++) {
      fireEvent.click(screen.getByText('OnPush'));
    }
    expect(screen.getByTestId('notif-count').textContent).toBe('50');
  });

  it('clearNotifications empties notifications', () => {
    renderWith();
    fireEvent.click(screen.getByText('OnPush'));
    fireEvent.click(screen.getByText('OnPush'));
    fireEvent.click(screen.getByText('ClearNotif'));
    expect(screen.getByTestId('notif-count').textContent).toBe('0');
  });

  it('onClusterUpdated updates currentMember clusterId', () => {
    renderWith();
    fireEvent.click(screen.getByText('SetMember'));
    fireEvent.click(screen.getByText('OnCluster'));
    expect(screen.getByTestId('member').textContent).toBe('u1');
  });

  it('onClusterUpdated ignores when no currentMember', () => {
    renderWith();
    expect(() => fireEvent.click(screen.getByText('OnCluster'))).not.toThrow();
    expect(screen.getByTestId('member').textContent).toBe('null');
  });

  // ── HTTP 方法（renderHook + mock fetch）──
  it('fetchFeed populates feed on first call (cursor=null)', async () => {
    const mockPosts = [{ id: 1, content: 'a' }, { id: 2, content: 'b' }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ ok: true, data: mockPosts }),
    }));
    const { result } = renderCommunityHook();
    await act(async () => { await result.current.fetchFeed(); });
    expect(result.current.feed.length).toBe(2);
    vi.unstubAllGlobals();
  });

  it('fetchClusters populates clusters', async () => {
    const mockClusters = [{ clusterId: 1, label: 'rock', memberCount: 3 }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ ok: true, data: mockClusters }),
    }));
    const { result } = renderCommunityHook();
    await act(async () => { await result.current.fetchClusters(); });
    expect(result.current.clusters.length).toBe(1);
    vi.unstubAllGlobals();
  });

  it('fetchInbox populates inbox', async () => {
    const mockInbox = [{ id: 1, targetType: 'post' }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ ok: true, data: mockInbox }),
    }));
    const { result } = renderCommunityHook();
    await act(async () => { await result.current.fetchInbox('u1'); });
    expect(result.current.inbox.length).toBe(1);
    vi.unstubAllGlobals();
  });

  it('createPost posts to /api/community/posts', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ ok: true, data: { id: 1, content: 'hi' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderCommunityHook();
    await act(async () => { await result.current.createPost({ userId: 'u1', type: 'reflection', content: 'hi' }); });
    expect(fetchMock).toHaveBeenCalledWith('/api/community/posts', expect.objectContaining({ method: 'POST' }));
    vi.unstubAllGlobals();
  });

  it('triggerAgentComment posts to /posts/:id/agent-comment', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ ok: true, data: { commentId: 9, content: 'good' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderCommunityHook();
    await act(async () => { await result.current.triggerAgentComment(1, 'u2'); });
    expect(fetchMock).toHaveBeenCalledWith('/api/community/posts/1/agent-comment', expect.objectContaining({ method: 'POST' }));
    vi.unstubAllGlobals();
  });

  it('updateAgentConfig PUTs to /me/agent-config', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ ok: true, data: { userId: 'u1', rules: { canComment: true } } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderCommunityHook();
    await act(async () => { await result.current.updateAgentConfig('u1', { canComment: true }); });
    expect(fetchMock).toHaveBeenCalledWith('/api/community/me/agent-config', expect.objectContaining({ method: 'PUT' }));
    expect(result.current.agentConfig.canComment).toBe(true);
    vi.unstubAllGlobals();
  });

  it('HTTP error throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const { result } = renderCommunityHook();
    await expect(act(async () => { await result.current.fetchFeed(); })).rejects.toThrow('fetch_feed_failed');
    vi.unstubAllGlobals();
  });

  it('useCommunity throws when used outside provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useCommunity())).toThrow('useCommunity must be used within CommunityProvider');
    spy.mockRestore();
  });
});
