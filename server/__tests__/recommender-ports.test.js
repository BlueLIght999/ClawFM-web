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

describe('Recommender port seams', () => {
  it('fillQueue_usesInjectedHistoryMusicAndQueueStore', async () => {
    const deps = makeDeps();
    deps.music.personalFm.mockResolvedValue([
      { id: '1', title: 'Song', artist: 'Artist', album: '', durationMs: 1000 },
    ]);
    const recommender = new Recommender(deps);
    recommender.initialized = true;

    const added = await recommender.fillQueue(1);

    expect(deps.listenHistory.recentSongIds).toHaveBeenCalledWith(200);
    expect(deps.listenHistory.artistPlayCount).toHaveBeenCalledWith(1);
    expect(deps.music.personalFm).toHaveBeenCalled();
    expect(deps.queueStore.addSongs).toHaveBeenCalledWith(added);
    expect(added).toHaveLength(1);
  });

  it('fillQueueByPreference_usesInjectedSeedPoolAndMusicDetails', async () => {
    const deps = makeDeps();
    deps.seedPool.all.mockReturnValue([{
      songId: '42',
      title: '午夜爵士',
      artist: 'Blue Trio',
      album: '',
      durationMs: 180000,
      source: 'liked',
      genreTags: ['jazz'],
      playCount: 0,
    }]);
    deps.music.details.mockResolvedValue([
      { id: '42', title: '午夜爵士', artist: 'Blue Trio', album: '', durationMs: 180000 },
    ]);
    const recommender = new Recommender(deps);

    const added = await recommender.fillQueueByPreference('jazz', 1);

    expect(deps.seedPool.all).toHaveBeenCalled();
    expect(deps.music.details).toHaveBeenCalledWith(['42']);
    expect(deps.queueStore.addSongs).toHaveBeenCalledWith(added);
    expect(added.map(s => s.id)).toEqual(['42']);
  });

  it('buildSeedPool_usesInjectedMusicRepositoriesAndProfile', async () => {
    const deps = makeDeps();
    deps.music.userPlaylists.mockResolvedValue([{ id: 'p1', name: 'Favorites' }]);
    deps.music.playlistTracks.mockResolvedValue([
      { id: '7', title: '晴天', artist: '周杰伦', album: '叶惠美', durationMs: 269000 },
    ]);
    deps.music.likedSongs.mockResolvedValue([
      { id: '8', title: '稻香', artist: '周杰伦', album: '魔杰座', durationMs: 223000 },
    ]);
    const recommender = new Recommender(deps);
    recommender.uid = 'u1';

    await recommender._buildSeedPool();

    expect(deps.music.userPlaylists).toHaveBeenCalledWith('u1');
    expect(deps.music.playlistTracks).toHaveBeenCalledWith('p1');
    expect(deps.music.likedSongs).toHaveBeenCalledWith('u1');
    expect(deps.seedPool.upsert).toHaveBeenCalledTimes(2);
    expect(deps.profile.set).toHaveBeenCalledWith('topArtists', [{ name: '周杰伦', count: 1 }]);
  });
});
