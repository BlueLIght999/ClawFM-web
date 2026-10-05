import { describe, expect, it } from 'vitest';
import {
  INVITATION_STATUS,
  canTransition,
  transition,
  settleResponse,
  checkInvitationAuthorization,
  normalizeInvitation,
  isActive,
  isParticipant,
  feedInviteeIds,
} from '../domain/community/invitationRules.js';

describe('community invitation rules', () => {
  it('INVITATION_STATUS_containsExpected', () => {
    expect(INVITATION_STATUS).toEqual(['pending', 'accepted', 'rejected', 'active', 'ended']);
  });

  it('canTransition_allowsValidEdges', () => {
    expect(canTransition('pending', 'accepted')).toBe(true);
    expect(canTransition('pending', 'rejected')).toBe(true);
    expect(canTransition('accepted', 'active')).toBe(true);
    expect(canTransition('active', 'ended')).toBe(true);
  });

  it('canTransition_rejectsInvalidEdges', () => {
    expect(canTransition('pending', 'active')).toBe(false); // 跳过 accepted
    expect(canTransition('rejected', 'active')).toBe(false); // 终态
    expect(canTransition('ended', 'active')).toBe(false); // 终态
    expect(canTransition('active', 'accepted')).toBe(false); // 不可逆
    expect(canTransition('bogus', 'active')).toBe(false);
    expect(canTransition('pending', 'bogus')).toBe(false);
  });

  it('transition_appliesValidTransition', () => {
    const r = transition({ status: 'pending' }, 'accepted');
    expect(r.ok).toBe(true);
    expect(r.status).toBe('accepted');
  });

  it('transition_rejectsInvalidWithDetails', () => {
    const r = transition({ status: 'rejected' }, 'active');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('invalid_transition');
    expect(r.from).toBe('rejected');
    expect(r.to).toBe('active');
  });

  it('transition_defaultsFromPending', () => {
    const r = transition({}, 'accepted');
    expect(r.ok).toBe(true);
  });

  // ── 被邀请方表态的落点 ──────────────────────────────────
  // accepted → active 这条边此前没有任何调用方走：客户端只发 accepted/rejected，
  // 服务端也从不自动推进，于是邀请永远停在 accepted——bring_playlist 永远
  // invitation_not_active，发现流重排也永远不生效（只认 active）。

  it('settleResponse_acceptingActivatesTheInvitation', () => {
    // 接受即生效：RC8 的双向授权在发邀请时已校验，接受是被邀请方的最后一道同意
    expect(settleResponse({ status: 'pending' }, 'accepted')).toEqual({ ok: true, status: 'active' });
  });

  it('settleResponse_rejectingStaysRejected', () => {
    expect(settleResponse({ status: 'pending' }, 'rejected')).toEqual({ ok: true, status: 'rejected' });
  });

  it('settleResponse_keepsTheStateMachineGuard', () => {
    // 不能借「接受」绕过状态机：终态与已生效的邀请都不能再被接受
    expect(settleResponse({ status: 'rejected' }, 'accepted')).toMatchObject({ ok: false, error: 'invalid_transition' });
    expect(settleResponse({ status: 'active' }, 'accepted')).toMatchObject({ ok: false, error: 'invalid_transition' });
    expect(settleResponse({ status: 'pending' }, 'bogus')).toMatchObject({ ok: false, error: 'invalid_transition' });
    // 自动推进只发生在「接受」之后：pending 不能跳过接受直接要 active
    expect(settleResponse({ status: 'pending' }, 'active')).toMatchObject({ ok: false, error: 'invalid_transition' });
  });

  // ── 参与方 ────────────────────────────────────────────
  it('isParticipant_acceptsEitherPartyAndFailsClosed', () => {
    const inv = { fromUserId: 'a', toUserId: 'b' };
    expect(isParticipant(inv, 'a')).toBe(true);
    expect(isParticipant(inv, 'b')).toBe(true);
    expect(isParticipant(inv, 'c')).toBe(false);
    // 缺调用者不能默认放行；空串的 fromUserId 也不能与空调用者「相等」
    expect(isParticipant(inv, '')).toBe(false);
    expect(isParticipant(inv, null)).toBe(false);
    expect(isParticipant({ fromUserId: '', toUserId: 'b' }, '')).toBe(false);
    expect(isParticipant(null, 'a')).toBe(false);
  });

  // ── 发现流加权只看「我邀请的人」────────────────────────
  it('feedInviteeIds_takesOnlyInvitationsTheViewerSent', () => {
    // listInvitations 返回双向的邀请：被邀请方自己的 feed 若也按这些邀请加权，
    // 拿到的是自己的画像——等于按自己的品味给自己重排，与 F9 的意图相反
    const invs = [
      { fromUserId: 'a', toUserId: 'b', status: 'active', contextType: 'feed' },
      { fromUserId: 'c', toUserId: 'a', status: 'active', contextType: 'feed' },
      { fromUserId: 'a', toUserId: 'd', status: 'pending', contextType: 'feed' },
      { fromUserId: 'a', toUserId: 'e', status: 'active', contextType: 'room' },
      { fromUserId: 'a', toUserId: 'f', status: 'active', contextType: 'feed' },
      { fromUserId: 'a', toUserId: 'b', status: 'active', contextType: 'feed' },
    ];
    expect(feedInviteeIds(invs, 'a')).toEqual(['b', 'f']);
    expect(feedInviteeIds(invs, 'b')).toEqual([]);
  });

  it('feedInviteeIds_handlesEmptyInput', () => {
    expect(feedInviteeIds(null, 'a')).toEqual([]);
    expect(feedInviteeIds([], 'a')).toEqual([]);
    expect(feedInviteeIds([{ fromUserId: 'a', toUserId: 'b', status: 'active', contextType: 'feed' }], '')).toEqual([]);
  });

  it('checkInvitationAuthorization_requiresBothFlags', () => {
    expect(checkInvitationAuthorization({ toRules: { canBeInvited: true, sharePlaylists: true } }).allowed).toBe(true);
    const r1 = checkInvitationAuthorization({ toRules: { canBeInvited: false, sharePlaylists: true } });
    expect(r1.allowed).toBe(false);
    expect(r1.reasons).toContain('invitee_not_invitable');
    const r2 = checkInvitationAuthorization({ toRules: { canBeInvited: true, sharePlaylists: false } });
    expect(r2.allowed).toBe(false);
    expect(r2.reasons).toContain('invitee_sharing_disabled');
  });

  it('checkInvitationAuthorization_handlesNull', () => {
    const r = checkInvitationAuthorization({});
    expect(r.allowed).toBe(false);
    expect(r.reasons.length).toBe(2);
  });

  it('normalizeInvitation_fillsDefaults', () => {
    const n = normalizeInvitation({ fromUserId: 'a', toUserId: 'b' });
    expect(n.contextType).toBe('feed');
    expect(n.status).toBe('pending');
    expect(n.contextId).toBeNull();
  });

  it('normalizeInvitation_clampsContextType', () => {
    expect(normalizeInvitation({ contextType: 'bogus' }).contextType).toBe('feed');
    expect(normalizeInvitation({ contextType: 'room' }).contextType).toBe('room');
  });

  it('normalizeInvitation_clampsStatus', () => {
    expect(normalizeInvitation({ status: 'bogus' }).status).toBe('pending');
    expect(normalizeInvitation({ status: 'active' }).status).toBe('active');
  });

  it('isActive_onlyForActiveStatus', () => {
    expect(isActive({ status: 'active' })).toBe(true);
    expect(isActive({ status: 'pending' })).toBe(false);
    expect(isActive({})).toBe(false);
    expect(isActive(null)).toBe(false);
  });
});
