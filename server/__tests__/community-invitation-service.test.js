import { describe, expect, it, beforeEach } from 'vitest';
import { createInvitationService } from '../application/services/InvitationService.js';

function makeMockRepo({ toConfig = null, invitation = null } = {}) {
  const created = [];
  const updates = [];
  return {
    created, updates,
    getMemberAgentConfig: () => toConfig,
    createInvitation: (inv) => { const id = created.length + 1; const rec = { id, ...inv }; created.push(rec); return rec; },
    getInvitation: () => invitation,
    updateInvitationStatus: (id, status) => { updates.push({ id, status }); },
    listInvitations: () => created,
  };
}

function makePublisher() {
  const emits = [];
  return { emits, emit: (event, payload, target) => { emits.push({ event, payload, target }); } };
}

let publisher;
beforeEach(() => { publisher = makePublisher(); });

describe('invitation service', () => {
  it('invite_createsWhenAuthorized', () => {
    const repo = makeMockRepo({ toConfig: { rules: { canBeInvited: true, sharePlaylists: true } } });
    const service = createInvitationService({ communityRepository: repo, eventPublisher: publisher });
    const r = service.invite({ fromUserId: 'a', toUserId: 'b', contextType: 'feed' });
    expect(r.ok).toBe(true);
    expect(r.toUserId).toBe('b');
    expect(r.status).toBe('pending');
    expect(repo.created.length).toBe(1);
    expect(publisher.emits[0].event).toBe('community:invitation');
    expect(publisher.emits[0].target).toBe('b');
  });

  it('invite_deniedWhenNotAuthorized', () => {
    const repo = makeMockRepo({ toConfig: { rules: { canBeInvited: false, sharePlaylists: false } } });
    const service = createInvitationService({ communityRepository: repo, eventPublisher: publisher });
    const r = service.invite({ fromUserId: 'a', toUserId: 'b' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('not_authorized');
    expect(r.reasons.length).toBe(2);
    expect(repo.created.length).toBe(0);
  });

  it('invite_deniedWhenNoConfig', () => {
    const repo = makeMockRepo({ toConfig: null });
    const service = createInvitationService({ communityRepository: repo, eventPublisher: publisher });
    const r = service.invite({ fromUserId: 'a', toUserId: 'b' });
    expect(r.ok).toBe(false);
  });

  it('invite_rejectsInvitingYourself', () => {
    // 自邀会让 A 的 feed 按 A 自己的品味「加权」（无意义），且绕开双向授权：
    // 被邀请方就是本人，RC8 的「对方同意」形同虚设
    const repo = makeMockRepo({ toConfig: { rules: { canBeInvited: true, sharePlaylists: true } } });
    const service = createInvitationService({ communityRepository: repo, eventPublisher: publisher });
    const r = service.invite({ fromUserId: 'a', toUserId: 'a' });
    expect(r).toEqual({ ok: false, error: 'cannot_invite_self' });
    expect(repo.created).toHaveLength(0);
    expect(publisher.emits).toHaveLength(0);
  });

  it('respond_appliesValidTransition', () => {
    const repo = makeMockRepo({ invitation: { id: 1, status: 'pending', fromUserId: 'a', toUserId: 'b' } });
    const service = createInvitationService({ communityRepository: repo, eventPublisher: publisher });
    const r = service.respond(1, 'accepted', 'b');
    expect(r.ok).toBe(true);
    expect(r.status).toBe('accepted');
    expect(repo.updates[0]).toEqual({ id: 1, status: 'accepted' });
  });

  it('respond_rejectsInvalidTransition', () => {
    const repo = makeMockRepo({ invitation: { id: 1, status: 'rejected', fromUserId: 'a', toUserId: 'b' } });
    const service = createInvitationService({ communityRepository: repo, eventPublisher: publisher });
    const r = service.respond(1, 'active', 'b');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('invalid_transition');
    expect(repo.updates.length).toBe(0);
  });

  it('respond_notFound', () => {
    const repo = makeMockRepo({ invitation: null });
    const service = createInvitationService({ communityRepository: repo, eventPublisher: publisher });
    const r = service.respond(99, 'accepted', 'b');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('not_found');
  });

  // ── 参与方校验（授权缺口修复）────────────────────────────
  // 这两个 endpoint 此前只看请求体里的状态/邀请 id，不看调用者是谁。id 是自增整数，
  // 任何持有效社区凭证的成员遍历到 id 就能替别人接受/拒绝邀请、或触发对他人的
  // cookie 解密。下面三条锁住修复后的行为。

  it('respond_rejectsCallerWhoIsNotTheInvitee', () => {
    const repo = makeMockRepo({ invitation: { id: 1, status: 'pending', fromUserId: 'a', toUserId: 'b' } });
    const service = createInvitationService({ communityRepository: repo, eventPublisher: publisher });
    const r = service.respond(1, 'accepted', 'c');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('not_participant');
    // 关键断言是没落库：拒绝要发生在状态机转移之前
    expect(repo.updates.length).toBe(0);
    expect(publisher.emits.length).toBe(0);
  });

  it('respond_rejectsInviterRespondingForInvitee', () => {
    // 邀请方也是参与方，但不能替对方表态——接受/拒绝只有被邀请方本人能决定
    const repo = makeMockRepo({ invitation: { id: 1, status: 'pending', fromUserId: 'a', toUserId: 'b' } });
    const service = createInvitationService({ communityRepository: repo, eventPublisher: publisher });
    const r = service.respond(1, 'accepted', 'a');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('not_participant');
    expect(repo.updates.length).toBe(0);
  });

  it('respond_failsClosedWithoutACaller', () => {
    // 缺调用者时不能默认放行——那等于把校验降级成可选
    const repo = makeMockRepo({ invitation: { id: 1, status: 'pending', fromUserId: 'a', toUserId: 'b' } });
    const service = createInvitationService({ communityRepository: repo, eventPublisher: publisher });
    const r = service.respond(1, 'accepted');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('not_participant');
    expect(repo.updates.length).toBe(0);
  });

  it('listForUser_returnsInvitations', () => {
    const repo = makeMockRepo({ toConfig: { rules: { canBeInvited: true, sharePlaylists: true } } });
    const service = createInvitationService({ communityRepository: repo, eventPublisher: publisher });
    service.invite({ fromUserId: 'a', toUserId: 'b' });
    const list = service.listForUser('a');
    expect(list.length).toBe(1);
  });
});

describe('invitation service bringPlaylist', () => {
  function makeBringRepo(invitation, auth = null) {
    return {
      getInvitation: () => invitation,
      getMemberAuth: () => auth,
      getMemberAgentConfig: () => null,
      createInvitation: (inv) => ({ id: 1, ...inv }),
      updateInvitationStatus: () => {},
      listInvitations: () => [],
    };
  }

  it('bringsPlaylistsToRoomWhenActiveRoomInvitation', async () => {
    const repo = makeBringRepo(
      { id: 1, status: 'active', contextType: 'room', contextId: 'room_xyz', fromUserId: 'a', toUserId: 'b' },
      { userId: 'b', neteaseUid: '123', cookieEncrypted: 'v1:enc' }
    );
    const roomEmits = [];
    const pub = { emitToRoom: (event, payload, roomId) => { roomEmits.push({ event, payload, roomId }); }, emit: () => {} };
    const netease = { fetchMemberPlaylists: async () => [{ id: 'pl1', name: '我的歌单', trackCount: 20, coverUrl: 'http://x' }] };
    const cipher = { decrypt: () => 'cookie' };
    const service = createInvitationService({ communityRepository: repo, neteaseHistoryPort: netease, cookieCipherPort: cipher, eventPublisher: pub });
    const r = await service.bringPlaylist(1, 'b');
    expect(r.ok).toBe(true);
    expect(r.playlists.length).toBe(1);
    expect(roomEmits[0].roomId).toBe('room_xyz');
    expect(roomEmits[0].payload.type).toBe('playlists_brought');
  });

  it('bringsPlaylistsToFeedWhenFeedInvitation', async () => {
    const repo = makeBringRepo(
      { id: 2, status: 'active', contextType: 'feed', contextId: null, fromUserId: 'a', toUserId: 'b' },
      { userId: 'b', neteaseUid: '123', cookieEncrypted: 'v1:enc' }
    );
    const emits = [];
    const pub = { emit: (event, payload, target) => { emits.push({ event, payload, target }); }, emitToRoom: () => {} };
    const service = createInvitationService({
      communityRepository: repo,
      neteaseHistoryPort: { fetchMemberPlaylists: async () => [{ id: 'pl1', name: 'x', trackCount: 1, coverUrl: '' }] },
      cookieCipherPort: { decrypt: () => 'c' },
      eventPublisher: pub,
    });
    const r = await service.bringPlaylist(2, 'b');
    expect(r.ok).toBe(true);
    expect(emits[0].event).toBe('community:push');
    expect(emits[0].target).toBe('a'); // 推给邀请方
  });

  it('rejectsWhenNotActive', async () => {
    const repo = makeBringRepo({ id: 1, status: 'pending', contextType: 'feed', fromUserId: 'a', toUserId: 'b' });
    const service = createInvitationService({ communityRepository: repo, eventPublisher: publisher });
    const r = await service.bringPlaylist(1, 'b');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('invitation_not_active');
  });

  it('rejectsWhenInviteeNoCredentials', async () => {
    const repo = makeBringRepo({ id: 1, status: 'active', contextType: 'feed', fromUserId: 'a', toUserId: 'b' }, null);
    const service = createInvitationService({ communityRepository: repo, eventPublisher: publisher });
    const r = await service.bringPlaylist(1, 'b');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('invitee_no_credentials');
  });

  it('rejectsWhenPlaylistFetchFails', async () => {
    const repo = makeBringRepo(
      { id: 1, status: 'active', contextType: 'feed', fromUserId: 'a', toUserId: 'b' },
      { userId: 'b', neteaseUid: '123', cookieEncrypted: 'v1:enc' }
    );
    const service = createInvitationService({
      communityRepository: repo,
      neteaseHistoryPort: { fetchMemberPlaylists: async () => { throw new Error('netease down'); } },
      cookieCipherPort: { decrypt: () => 'c' },
      eventPublisher: publisher,
    });
    const r = await service.bringPlaylist(1, 'b');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('playlist_fetch_failed');
  });

  // ── 参与方校验（授权缺口修复）────────────────────────────
  // 这条路径解密的是被邀请方的网易云 cookie。此前只要求邀请 active，
  // 于是任何知道 active 邀请 id 的成员都能触发对他人凭据的解密。

  it('rejectsNonParticipantWithoutDecryptingTheCookie', async () => {
    const repo = makeBringRepo(
      { id: 1, status: 'active', contextType: 'feed', fromUserId: 'a', toUserId: 'b' },
      { userId: 'b', neteaseUid: '123', cookieEncrypted: 'v1:enc' }
    );
    let decryptCalls = 0;
    let fetchCalls = 0;
    const service = createInvitationService({
      communityRepository: repo,
      neteaseHistoryPort: { fetchMemberPlaylists: async () => { fetchCalls += 1; return []; } },
      cookieCipherPort: { decrypt: () => { decryptCalls += 1; return 'c'; } },
      eventPublisher: publisher,
    });
    const r = await service.bringPlaylist(1, 'c');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('not_participant');
    // 真正的断言：拒绝必须发生在解密之前，cipher 一次都不该被调用
    expect(decryptCalls).toBe(0);
    expect(fetchCalls).toBe(0);
  });

  it('rejectsTheInviterFromBringingTheInviteesPlaylist', async () => {
    // 歌单与 cookie 都属于被邀请方，邀请方无权代他触发
    const repo = makeBringRepo(
      { id: 1, status: 'active', contextType: 'feed', fromUserId: 'a', toUserId: 'b' },
      { userId: 'b', neteaseUid: '123', cookieEncrypted: 'v1:enc' }
    );
    const service = createInvitationService({
      communityRepository: repo,
      neteaseHistoryPort: { fetchMemberPlaylists: async () => [] },
      cookieCipherPort: { decrypt: () => 'c' },
      eventPublisher: publisher,
    });
    const r = await service.bringPlaylist(1, 'a');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('not_participant');
  });

  it('bringPlaylist_failsClosedWithoutACaller', async () => {
    const repo = makeBringRepo(
      { id: 1, status: 'active', contextType: 'feed', fromUserId: 'a', toUserId: 'b' },
      { userId: 'b', neteaseUid: '123', cookieEncrypted: 'v1:enc' }
    );
    const service = createInvitationService({
      communityRepository: repo,
      neteaseHistoryPort: { fetchMemberPlaylists: async () => [] },
      cookieCipherPort: { decrypt: () => 'c' },
      eventPublisher: publisher,
    });
    const r = await service.bringPlaylist(1);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('not_participant');
  });
});
