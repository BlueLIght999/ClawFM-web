import { describe, expect, it } from 'vitest';
import { validateFollow } from '../domain/community/followRules.js';

/**
 * followRules had no test at all -- Stryker reported 0 of 19 mutants killed.
 * It is the only gate between a follow request and the follow table, and its
 * two rejections (missing id, self-follow) are what keep a member from
 * manufacturing a self-referential edge in the social graph.
 */

describe('validateFollow', () => {
  it('acceptsDistinctMembers', () => {
    expect(validateFollow('u1', 'u2')).toEqual({ ok: true });
  });

  it('rejectsMissingFollower', () => {
    expect(validateFollow(null, 'u2')).toEqual({ ok: false, error: 'user_ids_required' });
    expect(validateFollow(undefined, 'u2')).toEqual({ ok: false, error: 'user_ids_required' });
    expect(validateFollow('', 'u2')).toEqual({ ok: false, error: 'user_ids_required' });
  });

  it('rejectsMissingFollowee', () => {
    expect(validateFollow('u1', null)).toEqual({ ok: false, error: 'user_ids_required' });
    expect(validateFollow('u1', undefined)).toEqual({ ok: false, error: 'user_ids_required' });
    expect(validateFollow('u1', '')).toEqual({ ok: false, error: 'user_ids_required' });
  });

  it('rejectsBothMissing_withRequiredError', () => {
    // The missing-id check runs first, so a request with neither id reports
    // the requirement failure rather than the self-follow one.
    expect(validateFollow(null, null)).toEqual({ ok: false, error: 'user_ids_required' });
  });

  it('rejectsSelfFollow', () => {
    expect(validateFollow('u1', 'u1')).toEqual({ ok: false, error: 'cannot_follow_self' });
  });

  it('rejectsSelfFollow_acrossNumericAndStringIds', () => {
    // Ids arrive as strings from the wire and as numbers from the DB; a
    // strict === would let 7 follow '7' and create the self edge.
    expect(validateFollow(7, '7')).toEqual({ ok: false, error: 'cannot_follow_self' });
    expect(validateFollow('7', 7)).toEqual({ ok: false, error: 'cannot_follow_self' });
  });

  it('acceptsDifferentNumericIds', () => {
    expect(validateFollow(7, 8)).toEqual({ ok: true });
  });
});
