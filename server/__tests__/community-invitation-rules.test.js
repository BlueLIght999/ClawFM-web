import { describe, expect, it } from 'vitest';
import {
  INVITATION_STATUS,
  canTransition,
  transition,
  checkInvitationAuthorization,
  normalizeInvitation,
  isActive,
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
