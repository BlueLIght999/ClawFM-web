import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
    // Provider 挂载后会拉一次 /api/auth/status 补登录态；未登录（ok:false）时该流程提前返回，
    // 不影响 socket 断言。若不打桩，jsdom 无 fetch 会在 effect 里抛错。
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
    renderWith({ emit, on: vi.fn(), off: vi.fn() });
    fireEvent.click(screen.getByText('Identify'));
    expect(emit).toHaveBeenCalledWith('community:identify', 'u1');
  });

  it('joinRoom emits room:join with roomId', () => {
    const emit = vi.fn();
    renderWith({ emit, on: vi.fn(), off: vi.fn() });
    fireEvent.click(screen.getByText('JoinRoom'));
    expect(emit).toHaveBeenCalledWith('room:join', { roomId: 'r1' });
  });

  it('leaveRoom emits room:leave', () => {
    const emit = vi.fn();
    renderWith({ emit, on: vi.fn(), off: vi.fn() });
    fireEvent.click(screen.getByText('LeaveRoom'));
    expect(emit).toHaveBeenCalledWith('room:leave', { roomId: 'r1' });
  });

  it('roomSkip emits room:skip', () => {
    const emit = vi.fn();
    renderWith({ emit, on: vi.fn(), off: vi.fn() });
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

  it('likeSong posts the song to /songs/:id/like and remembers it as liked', async () => {
    // F4「成员点赞某歌 → 推给同簇其他人」：身份取登录态，body 只带展示用的歌名/歌手
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ ok: true, data: { liked: true, alreadyLiked: false } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderCommunityHook();
    await act(async () => { await result.current.likeSong({ songId: 's/9', title: '晴天', artist: '周杰伦' }); });
    expect(fetchMock).toHaveBeenCalledWith('/api/community/songs/s%2F9/like', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ title: '晴天', artist: '周杰伦' }),
    }));
    expect(result.current.likedSongIds).toEqual(['s/9']);
    vi.unstubAllGlobals();
  });

  it('likeSong surfaces the backend error and leaves the song unliked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 403, json: async () => ({ ok: false, error: 'not_member' }),
    }));
    const { result } = renderCommunityHook();
    await expect(act(async () => { await result.current.likeSong({ songId: 's9' }); })).rejects.toThrow('not_member');
    expect(result.current.likedSongIds).toEqual([]);
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

  // ── 自填标签（F1）──
  it('updateSelfTags PUTs normalized tags to /members/:id/self-tags', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ ok: true, data: { userId: 'u1', selfTags: ['后摇'], profileBuilt: true } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderCommunityHook();
    await act(async () => { await result.current.updateState({ currentMember: { userId: 'u1', selfTags: [] } }); });
    await act(async () => { await result.current.updateSelfTags('u1', [' 后摇 ']); });
    expect(fetchMock).toHaveBeenCalledWith('/api/community/members/u1/self-tags', expect.objectContaining({ method: 'PUT' }));
    // 本地用后端归一后的列表覆盖，而非原样保留前端输入
    expect(result.current.currentMember.selfTags).toEqual(['后摇']);
    vi.unstubAllGlobals();
  });

  // ── 相似成员（F1 自填标签的下游：邀请候选）──
  it('fetchSimilarMembers GETs /members/:id/similar and stores candidates', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({
        ok: true,
        data: { userId: 'u1', hasTags: true, candidates: [{ userId: 'u2', nickname: '阿七', score: 0.5, sharedTags: ['后摇'] }] },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderCommunityHook();
    await act(async () => { await result.current.fetchSimilarMembers('u1'); });
    expect(fetchMock).toHaveBeenCalledWith('/api/community/members/u1/similar', expect.objectContaining({ method: 'GET' }));
    expect(result.current.similarMembers.length).toBe(1);
    expect(result.current.similarMembers[0].userId).toBe('u2');
    // hasTags 要留住：空列表里「没填标签」与「有标签但没人相似」是两种状态，
    // 合成一个空数组就没法给用户不同的提示
    expect(result.current.similarHasTags).toBe(true);
    vi.unstubAllGlobals();
  });

  it('fetchSimilarMembers throws on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 501 }));
    const { result } = renderCommunityHook();
    await expect(act(async () => { await result.current.fetchSimilarMembers('u1'); }))
      .rejects.toThrow('fetch_similar_members_failed');
    vi.unstubAllGlobals();
  });

  it('updateSelfTags surfaces backend error code on rejection', async () => {
    // 后端以 error 字段说明拒绝原因，前端透传该码而非笼统的 update_self_tags_failed
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 400, json: async () => ({ ok: false, error: 'self_tag_too_long' }),
    }));
    const { result } = renderCommunityHook();
    await expect(act(async () => { await result.current.updateSelfTags('u1', ['x'.repeat(20)]); }))
      .rejects.toThrow('self_tag_too_long');
    vi.unstubAllGlobals();
  });
});
