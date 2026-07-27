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

  it('respond_appliesValidTransition', () => {
    const repo = makeMockRepo({ invitation: { id: 1, status: 'pending' } });
    const service = createInvitationService({ communityRepository: repo, eventPublisher: publisher });
    const r = service.respond(1, 'accepted');
    expect(r.ok).toBe(true);
    expect(r.status).toBe('accepted');
    expect(repo.updates[0]).toEqual({ id: 1, status: 'accepted' });
  });

  it('respond_rejectsInvalidTransition', () => {
    const repo = makeMockRepo({ invitation: { id: 1, status: 'rejected' } });
    const service = createInvitationService({ communityRepository: repo, eventPublisher: publisher });
    const r = service.respond(1, 'active');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('invalid_transition');
    expect(repo.updates.length).toBe(0);
  });

  it('respond_notFound', () => {
    const repo = makeMockRepo({ invitation: null });
    const service = createInvitationService({ communityRepository: repo, eventPublisher: publisher });
    const r = service.respond(99, 'accepted');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('not_found');
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
    const r = await service.bringPlaylist(1);
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
    const r = await service.bringPlaylist(2);
    expect(r.ok).toBe(true);
    expect(emits[0].event).toBe('community:push');
    expect(emits[0].target).toBe('a'); // 推给邀请方
  });

  it('rejectsWhenNotActive', async () => {
    const repo = makeBringRepo({ id: 1, status: 'pending', contextType: 'feed', fromUserId: 'a', toUserId: 'b' });
    const service = createInvitationService({ communityRepository: repo, eventPublisher: publisher });
    const r = await service.bringPlaylist(1);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('invitation_not_active');
  });

  it('rejectsWhenInviteeNoCredentials', async () => {
    const repo = makeBringRepo({ id: 1, status: 'active', contextType: 'feed', fromUserId: 'a', toUserId: 'b' }, null);
    const service = createInvitationService({ communityRepository: repo, eventPublisher: publisher });
    const r = await service.bringPlaylist(1);
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
    const r = await service.bringPlaylist(1);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('playlist_fetch_failed');
  });
});
