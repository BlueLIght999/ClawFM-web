import { describe, it, expect } from 'vitest';
import {
  authLoginStatusFromResult,
  authProfileFromResult,
  authUserIdFromResult,
  qrCreatedPayload,
  qrStatusFromCode,
} from '../domain/auth/authSessionRules.js';

describe('auth session rules', () => {
  it('authProfileFromResult_prefersProfileOverAccount', () => {
    const result = {
      profile: { userId: 42, nickname: 'Profile user' },
      account: { id: 99, nickname: 'Account user' },
    };

    expect(authProfileFromResult(result)).toEqual({ userId: 42, nickname: 'Profile user' });
  });

  it('authUserIdFromResult_usesProfileThenAccount', () => {
    expect(authUserIdFromResult({ profile: { userId: 42 }, account: { id: 99 } })).toBe('42');
    expect(authUserIdFromResult({ account: { id: 99 } })).toBe('99');
    expect(authUserIdFromResult({})).toBe('');
  });

  it('authLoginStatusFromResult_nestedRealProfile_reportsLoggedIn', () => {
    const result = {
      data: {
        profile: { userId: 42, nickname: 'Listener' },
        account: { id: 99 },
      },
    };

    expect(authLoginStatusFromResult(result)).toEqual({
      loggedIn: true,
      profile: { userId: 42, nickname: 'Listener' },
      uid: '42',
    });
  });

  it('authLoginStatusFromResult_anonymousAccount_reportsLoggedOut', () => {
    const result = {
      data: {
        account: { id: 99, anonimousUser: true },
      },
    };

    expect(authLoginStatusFromResult(result)).toEqual({
      loggedIn: false,
      profile: { id: 99, anonimousUser: true },
      uid: '',
    });
  });

  it('authLoginStatusFromResult_accountOnlyKeepsUidForStartupRestore', () => {
    const result = {
      data: {
        account: { id: 99, anonimousUser: false },
      },
    };

    expect(authLoginStatusFromResult(result)).toEqual({
      loggedIn: false,
      profile: { id: 99, anonimousUser: false },
      uid: '99',
    });
  });

  it('qrCreatedPayload_acceptsFlatAndNestedQrResults', () => {
    expect(qrCreatedPayload({ unikey: 'flat-key', qrimg: 'flat-img' })).toEqual({
      key: 'flat-key',
      qrUrl: 'https://music.163.com/login?codekey=flat-key',
      qrimg: 'flat-img',
    });
    expect(qrCreatedPayload({ data: { unikey: 'nested-key', qrimg: 'nested-img' } })).toEqual({
      key: 'nested-key',
      qrUrl: 'https://music.163.com/login?codekey=nested-key',
      qrimg: 'nested-img',
    });
  });

  it('qrStatusFromCode_mapsKnownNetEaseCodes', () => {
    expect(qrStatusFromCode(801)).toEqual({ status: 'waiting-scan', terminal: false });
    expect(qrStatusFromCode(802)).toEqual({ status: 'scanned', terminal: false });
    expect(qrStatusFromCode(800)).toEqual({ status: 'expired', terminal: true });
    expect(qrStatusFromCode(803)).toEqual({ status: 'success', terminal: true });
  });
});
