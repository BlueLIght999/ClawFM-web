import { describe, expect, it } from 'vitest';
import {
  dmThreadKey,
  validateDmMessage,
  validateOpenThread,
  canParticipate,
  peerUserId,
} from '../domain/community/dmRules.js';

/**
 * dmRules is the access-control layer for private messages: which thread a
 * pair maps to, who may read or post in one, and how long a message may be.
 * DmService delegates every one of those decisions here (DmService.js:12), so
 * an untested branch in this file is an untested branch on the DM boundary.
 * Stryker found these error paths uncovered -- they only run when a request is
 * malformed or hostile, which is exactly when the check matters.
 */

describe('dmThreadKey', () => {
  it('ordersThePairSoEitherDirectionYieldsOneKey', () => {
    // The whole point: A->B and B->A must resolve to the same thread row.
    expect(dmThreadKey('alice', 'bob')).toEqual(['alice', 'bob']);
    expect(dmThreadKey('bob', 'alice')).toEqual(['alice', 'bob']);
  });

  it('isStableForIdenticalIds', () => {
    expect(dmThreadKey('x', 'x')).toEqual(['x', 'x']);
  });

  it('comparesAsStrings_notNumerically', () => {
    // '10' < '9' lexicographically, so the pair keeps string order. Switching
    // to a numeric compare would reorder and split existing threads.
    expect(dmThreadKey('10', '9')).toEqual(['10', '9']);
    expect(dmThreadKey('9', '10')).toEqual(['10', '9']);
  });

  it('stringifiesNumericIds', () => {
    expect(dmThreadKey(2, 10)).toEqual(['10', '2']);
  });
});

describe('validateDmMessage', () => {
  it('acceptsOrdinaryText', () => {
    expect(validateDmMessage('hello')).toEqual({ ok: true, content: 'hello' });
  });

  it('trimsSurroundingWhitespace', () => {
    expect(validateDmMessage('  hi  ')).toEqual({ ok: true, content: 'hi' });
  });

  it('rejectsNonStringInput', () => {
    expect(validateDmMessage(null)).toEqual({ ok: false, error: 'content_required' });
    expect(validateDmMessage(undefined)).toEqual({ ok: false, error: 'content_required' });
    expect(validateDmMessage(42)).toEqual({ ok: false, error: 'content_required' });
    expect(validateDmMessage({ text: 'hi' })).toEqual({ ok: false, error: 'content_required' });
  });

  it('rejectsWhitespaceOnly', () => {
    expect(validateDmMessage('')).toEqual({ ok: false, error: 'content_required' });
    expect(validateDmMessage('   ')).toEqual({ ok: false, error: 'content_required' });
    expect(validateDmMessage('\n\t')).toEqual({ ok: false, error: 'content_required' });
  });

  it('acceptsExactlyTwoThousandChars', () => {
    const msg = 'a'.repeat(2000);
    expect(validateDmMessage(msg)).toEqual({ ok: true, content: msg });
  });

  it('rejectsAboveTwoThousandChars', () => {
    expect(validateDmMessage('a'.repeat(2001)))
      .toEqual({ ok: false, error: 'content_too_long' });
  });

  it('measuresLengthAfterTrimming', () => {
    // Padding must not be counted, or a valid 2000-char message with a
    // trailing space would be rejected.
    expect(validateDmMessage(`  ${'a'.repeat(2000)}  `).ok).toBe(true);
  });
});

describe('validateOpenThread', () => {
  it('acceptsTwoDistinctMembers', () => {
    expect(validateOpenThread('u1', 'u2')).toEqual({ ok: true });
  });

  it('rejectsMissingIds', () => {
    expect(validateOpenThread(null, 'u2')).toEqual({ ok: false, error: 'user_ids_required' });
    expect(validateOpenThread('u1', null)).toEqual({ ok: false, error: 'user_ids_required' });
    expect(validateOpenThread('', '')).toEqual({ ok: false, error: 'user_ids_required' });
  });

  it('rejectsOpeningAThreadWithYourself', () => {
    expect(validateOpenThread('u1', 'u1')).toEqual({ ok: false, error: 'cannot_dm_self' });
  });

  it('rejectsSelfThread_acrossNumericAndStringIds', () => {
    expect(validateOpenThread(5, '5')).toEqual({ ok: false, error: 'cannot_dm_self' });
    expect(validateOpenThread('5', 5)).toEqual({ ok: false, error: 'cannot_dm_self' });
  });
});

describe('canParticipate', () => {
  const thread = { userA: 'alice', userB: 'bob' };

  it('admitsBothSidesOfTheThread', () => {
    expect(canParticipate(thread, 'alice')).toBe(true);
    expect(canParticipate(thread, 'bob')).toBe(true);
  });

  it('rejectsThirdParties', () => {
    expect(canParticipate(thread, 'mallory')).toBe(false);
  });

  it('rejectsWhenThreadIsMissing', () => {
    expect(canParticipate(null, 'alice')).toBe(false);
    expect(canParticipate(undefined, 'alice')).toBe(false);
  });

  it('matchesAcrossIdTypes', () => {
    expect(canParticipate({ userA: 1, userB: 2 }, '1')).toBe(true);
    expect(canParticipate({ userA: '1', userB: '2' }, 1)).toBe(true);
  });

  it('rejectsEmptyViewer', () => {
    expect(canParticipate(thread, '')).toBe(false);
  });
});

describe('peerUserId', () => {
  const thread = { userA: 'alice', userB: 'bob' };

  it('returnsTheOtherSide_whenViewerIsUserA', () => {
    expect(peerUserId(thread, 'alice')).toBe('bob');
  });

  it('returnsTheOtherSide_whenViewerIsUserB', () => {
    expect(peerUserId(thread, 'bob')).toBe('alice');
  });

  it('fallsBackToUserA_forAnUnrelatedViewer', () => {
    // A viewer in neither slot gets userA, which canParticipate would already
    // have rejected -- the fallback is not an authorisation bypass.
    expect(peerUserId(thread, 'mallory')).toBe('alice');
  });

  it('matchesAcrossIdTypes', () => {
    expect(peerUserId({ userA: 1, userB: 'bob' }, '1')).toBe('bob');
  });
});
