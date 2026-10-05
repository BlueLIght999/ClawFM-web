/**
 * CommunityView 组件测试。
 *
 * 该组件此前只有手测覆盖，这里只钉真实缺口：
 *   - 邀请面板（F9）的候选选人：邀请表单此前只收手打 userId，用户必须事先知道
 *     对方 id 才能邀请。服务端 findSimilar 早就完整，前端零调用。
 *   - 发现流（F9 主目的地）：服务端早有按被邀请方品味重排的 feed，前端从不带
 *     forUserId，于是重排从未生效。
 *
 * mock 掉 useCommunity：本视图的依赖全从这个 hook 来，替身能精确控制候选与标签状态。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const noop = vi.fn().mockResolvedValue(undefined);

const ctx = {
  // ── state 分片：视图在渲染期直接读这些数组，缺一个就整棵崩，故全给齐 ──
  currentMember: { userId: 'u1', nickname: '我' },
  authUid: 'u1',
  feed: [],
  followingFeed: [],
  commentsByPost: {},
  memberCache: {},
  inbox: [],
  clusters: [],
  notifications: [],
  agentConfig: null,
  rooms: [],
  roomState: null,
  invitations: [],
  dmThreads: [],
  dmMessagesByThread: {},
  similarMembers: [],
  similarHasTags: false,
  // ── 方法 ──
  updateState: vi.fn(),
  fetchFeed: noop,
  fetchInbox: noop,
  fetchClusters: noop,
  fetchFollowingFeed: noop,
  createPost: noop,
  likePost: noop,
  triggerAgentComment: noop,
  updateAgentConfig: noop,
  createMember: noop,
  updateMemberProfile: noop,
  updateAvatar: noop,
  updateSelfTags: noop,
  clearNotifications: vi.fn(),
  fetchComments: noop,
  createComment: noop,
  follow: noop,
  unfollow: noop,
  fetchMember: noop,
  fetchRooms: noop,
  createRoom: noop,
  joinRoomHttp: noop,
  endRoom: noop,
  fetchInvitations: vi.fn().mockResolvedValue([]),
  fetchSimilarMembers: vi.fn().mockResolvedValue({ candidates: [] }),
  invite: vi.fn().mockResolvedValue({ ok: true }),
  respondInvitation: noop,
  bringPlaylist: noop,
  openDm: noop,
  fetchDmThreads: noop,
  fetchDmMessages: noop,
  sendDm: noop,
};

vi.mock('../contexts/CommunityContext.jsx', () => ({
  useCommunity: () => ctx,
}));

const { default: CommunityView } = await import('../components/CommunityView.jsx');

/** 切到 INVITATIONS tab 后渲染面板。 */
async function openInvitations() {
  render(<CommunityView />);
  fireEvent.click(screen.getByRole('button', { name: 'INVS' }));
  await waitFor(() => expect(ctx.fetchInvitations).toHaveBeenCalled());
}

describe('CommunityView 发现流', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ctx.currentMember = { userId: 'u1', nickname: '我' };
    ctx.feed = [];
  });

  it('首屏 feed 带上当前成员 id，服务端才会按被邀请方品味重排', async () => {
    ctx.fetchFeed = vi.fn().mockResolvedValue([]);
    render(<CommunityView />);
    await waitFor(() => {
      expect(ctx.fetchFeed).toHaveBeenCalledWith({ limit: 20, forUserId: 'u1' });
    });
  });

  it('翻页游标取本页最小 id 而不是最后一条的 id', async () => {
    // 重排后最后一条不再是最旧的帖：拿它当游标会跳过比它更旧、却被排到前面的帖
    const page = Array.from({ length: 20 }, (_, i) => ({
      id: 100 - i, userId: 'u2', type: 'reflection', content: `p${i}`, autoTags: [], likes: 0,
    }));
    [page[0], page[19]] = [page[19], page[0]]; // 最旧的 81 被重排到了第一位
    ctx.feed = page;
    ctx.fetchFeed = vi.fn().mockResolvedValue(page);
    render(<CommunityView />);
    const more = await screen.findByRole('button', { name: /more/i });
    fireEvent.click(more);
    await waitFor(() => {
      expect(ctx.fetchFeed).toHaveBeenLastCalledWith({ cursor: 81, limit: 20, forUserId: 'u1' });
    });
  });
});

describe('CommunityView 邀请候选', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ctx.currentMember = { userId: 'u1', nickname: '我' };
    ctx.similarMembers = [];
    ctx.similarHasTags = false;
    ctx.invitations = [];
    ctx.feed = [];
    ctx.fetchFeed = noop;
    ctx.fetchInvitations = vi.fn().mockResolvedValue([]);
    ctx.fetchSimilarMembers = vi.fn().mockResolvedValue({ candidates: [] });
    ctx.invite = vi.fn().mockResolvedValue({ ok: true });
  });

  it('打开邀请面板会拉相似成员候选', async () => {
    await openInvitations();
    expect(ctx.fetchSimilarMembers).toHaveBeenCalledWith('u1');
  });

  it('候选渲染成可点按钮，点击即以该 userId 发起邀请', async () => {
    ctx.similarMembers = [
      { userId: 'u2', nickname: '阿七', score: 0.5, sharedTags: ['后摇'] },
    ];
    await openInvitations();

    // 候选按钮带上昵称与共享标签，用户才知道「为什么推荐他」
    const chip = await screen.findByRole('button', { name: /阿七/ });
    expect(chip.textContent).toContain('后摇');

    fireEvent.click(chip);
    await waitFor(() => {
      expect(ctx.invite).toHaveBeenCalledWith({ fromUserId: 'u1', toUserId: 'u2' });
    });
  });

  it('没填标签时给出填标签的引导，而不是「暂无相似成员」', async () => {
    ctx.similarHasTags = false;
    ctx.similarMembers = [];
    await openInvitations();
    // 两条文案都含 "similar members"，必须用互斥断言，否则这条测试两种状态都过得去
    expect(await screen.findByText(/Add your interest tags/i)).toBeTruthy();
    expect(screen.queryByText(/No similar members yet/i)).toBeNull();
  });

  it('有标签但没人相似时，与「没填标签」提示不同', async () => {
    ctx.similarHasTags = true;
    ctx.similarMembers = [];
    await openInvitations();
    expect(await screen.findByText(/No similar members yet/i)).toBeTruthy();
    expect(screen.queryByText(/Add your interest tags/i)).toBeNull();
  });

  it('候选拉取失败时明说候选不可用，且手填输入仍可用', async () => {
    ctx.fetchSimilarMembers = vi.fn().mockRejectedValue(new Error('similar_members_not_enabled'));
    await openInvitations();
    expect(await screen.findByText(/unavailable/i)).toBeTruthy();
    const input = await screen.findByLabelText(/target user id/i);
    fireEvent.change(input, { target: { value: 'u9' } });
    fireEvent.click(screen.getByRole('button', { name: 'INVITE' }));
    await waitFor(() => {
      expect(ctx.invite).toHaveBeenCalledWith({ fromUserId: 'u1', toUserId: 'u9' });
    });
  });
});

describe('CommunityView 收件箱', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ctx.currentMember = { userId: 'u1', nickname: '我' };
  });

  it('按仓储的 camelCase 字段渲染：摘要作标题，来源写明是哪个触发与哪个簇', async () => {
    // 此前读 title/kind/from_cluster，仓储一个都不给：每一行都是「Untitled · push」
    ctx.inbox = [
      { id: 2, targetType: 'song', targetId: 's9', fromCluster: 4, reason: 'peer_liked', summary: '晴天 — 周杰伦' },
      { id: 1, targetType: 'playlist', targetId: 'p1#0', fromCluster: 2, reason: 'dj_playlist', summary: '深夜后摇 · post-rock' },
    ];
    render(<CommunityView />);
    fireEvent.click(screen.getByRole('button', { name: 'INBOX' }));
    expect(await screen.findByText('晴天 — 周杰伦')).toBeTruthy();
    expect(screen.getByText('深夜后摇 · post-rock')).toBeTruthy();
    expect(screen.getByText(/cluster peer liked · cluster #4/i)).toBeTruthy();
    expect(screen.getByText(/DJ is playing · cluster #2/i)).toBeTruthy();
    expect(screen.queryByText('Untitled')).toBeNull();
  });

  it('旧行没有摘要时退回到目标类型与 id，而不是 Untitled', async () => {
    ctx.inbox = [{ id: 1, targetType: 'post', targetId: '42', fromCluster: null, reason: 'post_tags', summary: null }];
    render(<CommunityView />);
    fireEvent.click(screen.getByRole('button', { name: 'INBOX' }));
    expect(await screen.findByText('post 42')).toBeTruthy();
    expect(screen.queryByText('Untitled')).toBeNull();
  });
});
