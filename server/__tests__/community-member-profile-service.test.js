import { describe, expect, it, beforeEach } from 'vitest';
import { createMemberProfileService } from '../application/services/MemberProfileService.js';

function makeMockRepo({ listens = [], selfTags = [], cookieEncrypted = 'v1:enc' } = {}) {
  const profiles = new Map();
  return {
    getMemberAuth: (userId) => cookieEncrypted ? { userId, neteaseUid: '123', cookieEncrypted, fetchedAt: null } : null,
    getMember: () => ({ userId: 'u1', nickname: 'n', avatarUrl: '', selfTags }),
    listListensByUser: () => listens,
    saveProfile: (userId, p) => { profiles.set(userId, p); },
    getProfile: (userId) => profiles.get(userId) || null,
    _profiles: profiles,
  };
}

function makeMockNetease({ signals = null, throwErr = null } = {}) {
  return {
    fetchMemberHistory: async () => {
      if (throwErr) throw throwErr;
      return signals || { topArtists: [{ name: '周杰伦', playCount: 10 }], topSongs: [], totalPlays: 10, timeSlotCounts: {}, genreCounts: {}, regionCounts: {} };
    },
  };
}

const cipherPort = { encrypt: (c) => `enc:${c}`, decrypt: (s) => s.replace(/^enc:/, '') };

let loggerWarns;
function makeLogger() {
  loggerWarns = [];
  return { warn: (_obj, msg) => loggerWarns.push(msg) };
}

let service;
beforeEach(() => {
  loggerWarns = [];
});

describe('member profile service', () => {
  it('buildProfile_fusesThreeSourcesAndStores', async () => {
    const repo = makeMockRepo({
      listens: [
        { action: 'liked', artist: 'Coldplay', playedAt: '2026-07-20T20:00:00Z' },
        { action: 'skipped', artist: '周杰伦', playedAt: '2026-07-20T09:00:00Z' },
      ],
      selfTags: ['通勤'],
    });
    service = createMemberProfileService({
      communityRepository: repo,
      neteaseHistoryPort: makeMockNetease(),
      cookieCipherPort: cipherPort,
      logger: makeLogger(),
    });
    const r = await service.buildProfile('u1');
    expect(r.ok).toBe(true);
    expect(r.degraded).toBe(false);
    // artist affinity from netease (周杰伦 weight 1.0)
    expect(r.profile.artistAffinity[0]).toEqual({ artist: '周杰伦', weight: 1 });
    // user tags from selfTags
    expect(r.profile.userTags).toEqual([{ tag: '通勤', weight: 1 }]);
    // behavior from radio listens: skip_prone=1, replay_lover=1
    expect(r.profile.tags.behavior.skip_prone).toBeGreaterThan(0);
    expect(r.profile.tags.behavior.replay_lover).toBeGreaterThan(0);
    // stored
    expect(repo.getProfile('u1')).toBe(r.profile);
  });

  it('buildProfile_degradesWhenNeteaseFails', async () => {
    const repo = makeMockRepo({ listens: [{ action: 'liked', artist: 'A', playedAt: '2026-07-20T20:00:00Z' }], selfTags: [] });
    service = createMemberProfileService({
      communityRepository: repo,
      neteaseHistoryPort: makeMockNetease({ throwErr: new Error('netease down') }),
      cookieCipherPort: cipherPort,
      logger: makeLogger(),
    });
    const r = await service.buildProfile('u1');
    expect(r.ok).toBe(true);
    expect(r.degraded).toBe(true);
    expect(r.profile.meta.totalPlays).toBe(0);
    expect(r.profile.artistAffinity).toEqual([]);
    expect(loggerWarns.length).toBe(1);
  });

  it('buildProfile_returnsErrorWhenNoCredentials', async () => {
    const repo = makeMockRepo({ cookieEncrypted: null });
    service = createMemberProfileService({
      communityRepository: repo,
      neteaseHistoryPort: makeMockNetease(),
      cookieCipherPort: cipherPort,
      logger: makeLogger(),
    });
    const r = await service.buildProfile('u1');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('no_credentials');
  });

  it('buildProfile_handlesEmptyListens', async () => {
    const repo = makeMockRepo({ listens: [], selfTags: [] });
    service = createMemberProfileService({
      communityRepository: repo,
      neteaseHistoryPort: makeMockNetease(),
      cookieCipherPort: cipherPort,
      logger: makeLogger(),
    });
    const r = await service.buildProfile('u1');
    expect(r.ok).toBe(true);
    expect(r.profile.tags.behavior.skip_prone).toBe(0);
    expect(r.profile.timeSlot.morning).toBe(0);
  });

  it('getProfile_returnsStoredOrNull', async () => {
    const repo = makeMockRepo({ listens: [], selfTags: [] });
    service = createMemberProfileService({
      communityRepository: repo,
      neteaseHistoryPort: makeMockNetease(),
      cookieCipherPort: cipherPort,
      logger: makeLogger(),
    });
    expect(service.getProfile('u1')).toBeNull();
    await service.buildProfile('u1');
    expect(service.getProfile('u1')).not.toBeNull();
  });
});
