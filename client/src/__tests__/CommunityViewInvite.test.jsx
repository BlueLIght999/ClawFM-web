/**
 * CommunityView 邀请面板（F9）的候选选人测试。
 *
 * 这是 CommunityView 的第一个组件测试：该文件此前只有手测覆盖。测试只钉
 * 「候选能选、能带进 onInvite」这一条真实缺口——邀请表单此前只收手打 userId，
 * 用户必须事先知道对方 id 才能邀请。服务端 findSimilar 早就完整，前端零调用。
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

describe('CommunityView 邀请候选', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ctx.currentMember = { userId: 'u1', nickname: '我' };
    ctx.similarMembers = [];
    ctx.similarHasTags = false;
    ctx.invitations = [];
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
