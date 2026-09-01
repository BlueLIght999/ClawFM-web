import { describe, it, expect, vi } from 'vitest';

vi.mock('../infrastructure/netease/neteaseApi.js', () => ({
  getUserPlaylists: vi.fn(() => { throw new Error('legacy getUserPlaylists called'); }),
  getPlaylistTracks: vi.fn(() => { throw new Error('legacy getPlaylistTracks called'); }),
  getLikedSongs: vi.fn(() => { throw new Error('legacy getLikedSongs called'); }),
  getRecommendSongs: vi.fn(() => { throw new Error('legacy getRecommendSongs called'); }),
  getPersonalFm: vi.fn(() => { throw new Error('legacy getPersonalFm called'); }),
  getSimilarSongs: vi.fn(() => { throw new Error('legacy getSimilarSongs called'); }),
  getSmartPlaylist: vi.fn(() => { throw new Error('legacy getSmartPlaylist called'); }),
  searchSongs: vi.fn(() => { throw new Error('legacy searchSongs called'); }),
  getSongDetail: vi.fn(() => { throw new Error('legacy getSongDetail called'); }),
  getSongUrl: vi.fn(() => { throw new Error('legacy getSongUrl called'); }),
  getLyric: vi.fn(() => { throw new Error('legacy getLyric called'); }),
  scrobbleSong: vi.fn(() => { throw new Error('legacy scrobbleSong called'); }),
  getArtistDetail: vi.fn(() => { throw new Error('legacy getArtistDetail called'); }),
  getArtistDesc: vi.fn(() => { throw new Error('legacy getArtistDesc called'); }),
  getArtistSongs: vi.fn(() => { throw new Error('legacy getArtistSongs called'); }),
  getStyleList: vi.fn(() => { throw new Error('legacy getStyleList called'); }),
  getStyleSongs: vi.fn(() => { throw new Error('legacy getStyleSongs called'); }),
  getStyleArtists: vi.fn(() => { throw new Error('legacy getStyleArtists called'); }),
  getSongWikiSummary: vi.fn(() => { throw new Error('legacy getSongWikiSummary called'); }),
  getSongCreators: vi.fn(() => { throw new Error('legacy getSongCreators called'); }),
  getSimilarArtists: vi.fn(() => { throw new Error('legacy getSimilarArtists called'); }),
  getPlaymodeIntelligenceList: vi.fn(() => { throw new Error('legacy getPlaymodeIntelligenceList called'); }),
  getRecommendResource: vi.fn(() => { throw new Error('legacy getRecommendResource called'); }),
  getPersonalized: vi.fn(() => { throw new Error('legacy getPersonalized called'); }),
  getSearchSuggest: vi.fn(() => { throw new Error('legacy getSearchSuggest called'); }),
  getSearchHotDetail: vi.fn(() => { throw new Error('legacy getSearchHotDetail called'); }),
  getPlaylistCatlist: vi.fn(() => { throw new Error('legacy getPlaylistCatlist called'); }),
  getPlaylistHot: vi.fn(() => { throw new Error('legacy getPlaylistHot called'); }),
}));

vi.mock('../db/history.js', () => ({
  setUserProfile: vi.fn(() => { throw new Error('legacy setUserProfile called'); }),
  getUserProfile: vi.fn(() => { throw new Error('legacy getUserProfile called'); }),
  getRecentSongIds: vi.fn(() => { throw new Error('legacy getRecentSongIds called'); }),
  recordListen: vi.fn(() => { throw new Error('legacy recordListen called'); }),
  getListenHistory: vi.fn(() => { throw new Error('legacy getListenHistory called'); }),
  getSeedPool: vi.fn(() => { throw new Error('legacy getSeedPool called'); }),
  upsertSeedPool: vi.fn(() => { throw new Error('legacy upsertSeedPool called'); }),
  incrementPlayCount: vi.fn(() => { throw new Error('legacy incrementPlayCount called'); }),
  getArtistPlayCount: vi.fn(() => { throw new Error('legacy getArtistPlayCount called'); }),
  getLatestQueueSnapshot: vi.fn(() => null),
  saveQueueSnapshot: vi.fn(),
}));

const { Recommender } = await import('../services/recommender.js');

function makeDeps(overrides = {}) {
  return {
    music: {
      userPlaylists: vi.fn(async () => []),
      playlistTracks: vi.fn(async () => []),
      likedSongs: vi.fn(async () => []),
      personalFm: vi.fn(async () => []),
      similar: vi.fn(async () => []),
      dailyRecommend: vi.fn(async () => []),
      search: vi.fn(async () => []),
      details: vi.fn(async () => []),
    },
    listenHistory: {
      recentSongIds: vi.fn(() => []),
      artistPlayCount: vi.fn(() => []),
    },
    seedPool: {
      all: vi.fn(() => []),
      upsert: vi.fn(),
    },
    profile: {
      get: vi.fn(() => ({})),
      set: vi.fn(),
    },
    corpus: {
      readTaste: vi.fn(() => '## Artists\n- '),
      readRoutines: vi.fn(() => '## Routine Anchors\n- '),
      readMoodRules: vi.fn(() => ''),
      writeTaste: vi.fn(),
      writeRoutines: vi.fn(),
    },
    queueStore: {
      current: null,
      addSongs: vi.fn(),
    },
    ...overrides,
  };
}

// ─── RC1: Seed pool retry mechanism ─────────────────────────────

describe('RC1: _maybeBuildSeedPool retries on failure', () => {
  it('retriesSeedPoolBuild_whenFirstAttemptFails', async () => {
    const deps = makeDeps();
    deps.music.userPlaylists
      .mockRejectedValueOnce(new Error('network timeout'))
      .mockResolvedValueOnce([{ id: 'p1', name: 'Favs' }]);
    deps.music.playlistTracks.mockResolvedValue([
      { id: 's1', ar: [{ name: 'Artist A' }], al: {}, dt: 180 },
    ]);

    const rec = new Recommender(deps);
    rec.uid = 'u1';
    rec._seedPoolPending = true;
    rec._seedPoolRetryCount = 0;
    rec._seedPoolMaxRetries = 3;

    // First attempt: fails
    await rec._maybeBuildSeedPool();
    expect(rec._seedPoolPending).toBe(true); // still pending, will retry

    // Second attempt: succeeds
    await rec._maybeBuildSeedPool();
    expect(rec._seedPoolPending).toBe(false); // no longer pending
    expect(rec.topArtists).toEqual([{ name: 'Artist A', count: 1 }]);
  });

  it('stopsRetrying_afterMaxRetries', async () => {
    const deps = makeDeps();
    deps.music.userPlaylists.mockRejectedValue(new Error('persistent failure'));

    const rec = new Recommender(deps);
    rec.uid = 'u1';
    rec._seedPoolPending = true;
    rec._seedPoolRetryCount = 0;
    rec._seedPoolMaxRetries = 2;

    // Attempt 1
    await rec._maybeBuildSeedPool();
    expect(rec._seedPoolPending).toBe(true);

    // Attempt 2
    await rec._maybeBuildSeedPool();
    expect(rec._seedPoolPending).toBe(false); // exhausted retries
    expect(rec.topArtists).toEqual([]);
  });

  it('doesNotRetry_whenBuildSucceeds', async () => {
    const deps = makeDeps();
    deps.music.userPlaylists.mockResolvedValue([{ id: 'p1', name: 'Favs' }]);
    deps.music.playlistTracks.mockResolvedValue([
      { id: 's1', ar: [{ name: 'Artist A' }], al: {}, dt: 180 },
    ]);

    const rec = new Recommender(deps);
    rec.uid = 'u1';
    rec._seedPoolPending = true;
    rec._seedPoolRetryCount = 0;
    rec._seedPoolMaxRetries = 3;

    await rec._maybeBuildSeedPool();
    expect(rec._seedPoolPending).toBe(false);
    expect(rec.topArtists).toEqual([{ name: 'Artist A', count: 1 }]);

    // Calling again should be a no-op
    const upsertCountBefore = deps.seedPool.upsert.mock.calls.length;
    await rec._maybeBuildSeedPool();
    expect(deps.seedPool.upsert.mock.calls.length).toBe(upsertCountBefore);
  });
});

// ─── RC3: topArtists incremental persistence ────────────────────

describe('RC3: _buildSeedPool persists partial topArtists', () => {
  it('persistsTopArtists_whenSomePlaylistsFail', async () => {
    const deps = makeDeps();
    deps.music.userPlaylists.mockResolvedValue([
      { id: 'p1', name: 'OK' },
      { id: 'p2', name: 'Fail' },
    ]);
    deps.music.playlistTracks
      .mockResolvedValueOnce([{ id: 's1', ar: [{ name: 'Artist A' }], al: {}, dt: 180 }])
      .mockRejectedValueOnce(new Error('single playlist fail'));
    deps.music.likedSongs.mockResolvedValue([]);

    const rec = new Recommender(deps);
    rec.uid = 'u1';

    await rec._buildSeedPool();

    // topArtists should be persisted even though one playlist failed
    expect(rec.topArtists).toEqual([{ name: 'Artist A', count: 1 }]);
    expect(deps.profile.set).toHaveBeenCalledWith('topArtists', [{ name: 'Artist A', count: 1 }]);
  });
});

// ─── RC4: LOGIN_REQUIRED callback ──────────────────────────────

describe('RC4: recommender loginExpired callback', () => {
  it('callsLoginExpiredCallback_whenSeedPoolFailsWithLoginError', async () => {
    const deps = makeDeps();
    deps.music.userPlaylists.mockRejectedValue(new Error('Login expired — please re-login'));

    const rec = new Recommender(deps);
    rec.uid = 'u1';
    const callback = vi.fn();
    rec.onLoginExpired(callback);

    rec._seedPoolPending = true;
    rec._seedPoolRetryCount = 0;
    rec._seedPoolMaxRetries = 1;

    await rec._maybeBuildSeedPool();

    expect(callback).toHaveBeenCalled();
  });

  it('doesNotCallLoginExpiredCallback_whenErrorIsNotLoginRelated', async () => {
    const deps = makeDeps();
    deps.music.userPlaylists.mockRejectedValue(new Error('network timeout'));

    const rec = new Recommender(deps);
    rec.uid = 'u1';
    const callback = vi.fn();
    rec.onLoginExpired(callback);

    rec._seedPoolPending = true;
    rec._seedPoolRetryCount = 0;
    rec._seedPoolMaxRetries = 1;

    await rec._maybeBuildSeedPool();

    expect(callback).not.toHaveBeenCalled();
  });
});
