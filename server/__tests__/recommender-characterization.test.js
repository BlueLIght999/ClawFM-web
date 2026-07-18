import { describe, it, expect, vi } from 'vitest';

vi.mock('../infrastructure/netease/neteaseApi.js', () => ({
  getUserPlaylists: vi.fn(() => { throw new Error('legacy'); }),
  getPlaylistTracks: vi.fn(() => { throw new Error('legacy'); }),
  getLikedSongs: vi.fn(() => { throw new Error('legacy'); }),
  getRecommendSongs: vi.fn(() => { throw new Error('legacy'); }),
  getPersonalFm: vi.fn(() => { throw new Error('legacy'); }),
  getSimilarSongs: vi.fn(() => { throw new Error('legacy'); }),
  getSmartPlaylist: vi.fn(() => { throw new Error('legacy'); }),
  searchSongs: vi.fn(() => { throw new Error('legacy'); }),
  getSongDetail: vi.fn(() => { throw new Error('legacy'); }),
  getSongUrl: vi.fn(() => { throw new Error('legacy'); }),
  getLyric: vi.fn(() => { throw new Error('legacy'); }),
  scrobbleSong: vi.fn(() => { throw new Error('legacy'); }),
  getArtistDetail: vi.fn(() => { throw new Error('legacy'); }),
  getArtistDesc: vi.fn(() => { throw new Error('legacy'); }),
  getArtistSongs: vi.fn(() => { throw new Error('legacy'); }),
  getStyleList: vi.fn(() => { throw new Error('legacy'); }),
  getStyleSongs: vi.fn(() => { throw new Error('legacy'); }),
  getStyleArtists: vi.fn(() => { throw new Error('legacy'); }),
  getSongWikiSummary: vi.fn(() => { throw new Error('legacy'); }),
  getSongCreators: vi.fn(() => { throw new Error('legacy'); }),
  getSimilarArtists: vi.fn(() => { throw new Error('legacy'); }),
  getPlaymodeIntelligenceList: vi.fn(() => { throw new Error('legacy'); }),
  getRecommendResource: vi.fn(() => { throw new Error('legacy'); }),
  getPersonalized: vi.fn(() => { throw new Error('legacy'); }),
  getSearchSuggest: vi.fn(() => { throw new Error('legacy'); }),
  getSearchHotDetail: vi.fn(() => { throw new Error('legacy'); }),
  getPlaylistCatlist: vi.fn(() => { throw new Error('legacy'); }),
  getPlaylistHot: vi.fn(() => { throw new Error('legacy'); }),
}));

vi.mock('../db/history.js', () => ({
  setUserProfile: vi.fn(() => { throw new Error('legacy'); }),
  getUserProfile: vi.fn(() => { throw new Error('legacy'); }),
  getRecentSongIds: vi.fn(() => { throw new Error('legacy'); }),
  recordListen: vi.fn(() => { throw new Error('legacy'); }),
  getListenHistory: vi.fn(() => { throw new Error('legacy'); }),
  getSeedPool: vi.fn(() => { throw new Error('legacy'); }),
  upsertSeedPool: vi.fn(() => { throw new Error('legacy'); }),
  incrementPlayCount: vi.fn(() => { throw new Error('legacy'); }),
  getArtistPlayCount: vi.fn(() => { throw new Error('legacy'); }),
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
      searchPlaylists: vi.fn(async () => []),
      searchArtists: vi.fn(async () => []),
      getPlaylistTracks: vi.fn(async () => []),
      artistHotSongs: vi.fn(async () => []),
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
      readTaste: vi.fn(() => '## Artists\n- Custom content'),
      readRoutines: vi.fn(() => '## Routine Anchors\n- Custom'),
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

function makeSong(id, artist = 'Artist') {
  return { id: String(id), title: `Song ${id}`, artist, album: '', durationMs: 1000 };
}

// ─── fillQueue: guard clauses ────────────────────────────────────

describe('fillQueue characterization', () => {
  it('returns empty array when not initialized', async () => {
    const r = new Recommender(makeDeps());
    const result = await r.fillQueue(10);
    expect(result).toEqual([]);
  });

  it('queries listenHistory for recentSongIds(200) and artistPlayCount(1)', async () => {
    const deps = makeDeps();
    deps.music.personalFm.mockResolvedValue([makeSong('1')]);
    const r = new Recommender(deps);
    r.initialized = true;
    await r.fillQueue(1);
    expect(deps.listenHistory.recentSongIds).toHaveBeenCalledWith(200);
    expect(deps.listenHistory.artistPlayCount).toHaveBeenCalledWith(1);
  });

  it('uses strategies [personalFm, similarSongs, dailyRecs, genreSearch] without hints', async () => {
    const deps = makeDeps();
    deps.music.personalFm.mockResolvedValue([makeSong('1')]);
    const r = new Recommender(deps);
    r.initialized = true;
    await r.fillQueue(1);
    expect(deps.music.personalFm).toHaveBeenCalled();
    expect(deps.music.similar).not.toHaveBeenCalled(); // got enough from personalFm
  });

  it('uses strategies [genreHints, personalFm, similarSongs, dailyRecs, genreSearch] with hints', async () => {
    const deps = makeDeps();
    deps.music.search.mockResolvedValue([makeSong('99')]); // genre hints search (via GenreSearchEngine seedArtists + enhancedQuery)
    const r = new Recommender(deps);
    r.initialized = true;
    const hints = [{ genreHints: ['jazz'], targetCount: 5 }];
    await r.fillQueue(1, hints);
    // GenreSearchEngine uses search() for seed artist search and enhanced query fallback
    expect(deps.music.search).toHaveBeenCalled();
  });

  it('deduplicates songs by id', async () => {
    const deps = makeDeps();
    deps.music.personalFm.mockResolvedValue([makeSong('1'), makeSong('1'), makeSong('2')]);
    const r = new Recommender(deps);
    r.initialized = true;
    const result = await r.fillQueue(10);
    expect(result.map(s => s.id)).toEqual(['1', '2']);
  });

  it('stops at targetSize', async () => {
    const deps = makeDeps();
    deps.music.personalFm.mockResolvedValue([makeSong('1'), makeSong('2'), makeSong('3')]);
    const r = new Recommender(deps);
    r.initialized = true;
    const result = await r.fillQueue(2);
    expect(result).toHaveLength(2);
  });

  it('skips songs already in recentIds', async () => {
    const deps = makeDeps();
    deps.listenHistory.recentSongIds.mockReturnValue(['1']);
    deps.music.personalFm.mockResolvedValue([makeSong('1'), makeSong('2')]);
    const r = new Recommender(deps);
    r.initialized = true;
    const result = await r.fillQueue(10);
    expect(result.map(s => s.id)).toEqual(['2']);
  });

  it('adds songs to queueStore when results non-empty', async () => {
    const deps = makeDeps();
    deps.music.personalFm.mockResolvedValue([makeSong('1')]);
    const r = new Recommender(deps);
    r.initialized = true;
    const result = await r.fillQueue(1);
    expect(deps.queueStore.addSongs).toHaveBeenCalledWith(result);
  });

  it('does NOT call addSongs when result is empty', async () => {
    const deps = makeDeps();
    const r = new Recommender(deps);
    r.initialized = true;
    await r.fillQueue(1);
    expect(deps.queueStore.addSongs).not.toHaveBeenCalled();
  });

  it('updates plan progress songsFilledInBlock when hints active', async () => {
    const deps = makeDeps();
    deps.music.personalFm.mockResolvedValue([makeSong('1'), makeSong('2')]);
    const r = new Recommender(deps);
    r.initialized = true;
    const hints = [{ genreHints: ['rock'], targetCount: 5 }];
    await r.fillQueue(2, hints);
    expect(r._planProgress.songsFilledInBlock).toBe(2);
  });

  it('auto-advances to next block when current block is full', async () => {
    const deps = makeDeps();
    deps.music.personalFm.mockResolvedValue([makeSong('1'), makeSong('2')]);
    const r = new Recommender(deps);
    r.initialized = true;
    const hints = [
      { genreHints: ['rock'], targetCount: 2 },
      { genreHints: ['jazz'], targetCount: 5 },
    ];
    // Pre-fill current block to trigger advance
    r._planProgress.songsFilledInBlock = 2;
    await r.fillQueue(2, hints);
    expect(r._planProgress.currentBlockIndex).toBe(1);
    // songsFilledInBlock reset to 0 on advance, then refilled by fillQueue
    expect(r._planProgress.songsFilledInBlock).toBe(2);
  });

  it('wraps currentBlockIndex back to 0 when exceeding hints length', async () => {
    const deps = makeDeps();
    deps.music.personalFm.mockResolvedValue([makeSong('1')]);
    const r = new Recommender(deps);
    r.initialized = true;
    const hints = [{ genreHints: ['rock'], targetCount: 1 }];
    r._planProgress.songsFilledInBlock = 1;
    await r.fillQueue(1, hints);
    expect(r._planProgress.currentBlockIndex).toBe(0);
  });

  it('does NOT auto-advance when autoMode is false', async () => {
    const deps = makeDeps();
    deps.music.personalFm.mockResolvedValue([makeSong('1')]);
    const r = new Recommender(deps);
    r.initialized = true;
    r._planProgress.autoMode = false;
    r._planProgress.songsFilledInBlock = 99;
    const hints = [{ genreHints: ['rock'], targetCount: 1 }];
    await r.fillQueue(1, hints);
    expect(r._planProgress.currentBlockIndex).toBe(0);
  });

  it('falls through strategies when first returns empty', async () => {
    const deps = makeDeps();
    deps.music.personalFm.mockResolvedValue([]);
    deps.music.similar.mockResolvedValue([makeSong('5')]);
    deps.queueStore.current = { id: '1' };
    const r = new Recommender(deps);
    r.initialized = true;
    const result = await r.fillQueue(1);
    expect(deps.music.similar).toHaveBeenCalled();
    expect(result.map(s => s.id)).toEqual(['5']);
  });

  it('falls through all strategies returning empty when all fail', async () => {
    const deps = makeDeps();
    const r = new Recommender(deps);
    r.initialized = true;
    const result = await r.fillQueue(5);
    expect(result).toEqual([]);
    expect(deps.queueStore.addSongs).not.toHaveBeenCalled();
  });
});

// ─── fillQueueByPreference ───────────────────────────────────────

describe('fillQueueByPreference characterization', () => {
  it('matches from seed pool via music.details', async () => {
    const deps = makeDeps();
    deps.seedPool.all.mockReturnValue([{
      songId: '42', title: 'Jazz', artist: 'Blue',
      album: '', durationMs: 100, source: 'liked', genreTags: ['jazz'], playCount: 0,
    }]);
    deps.music.details.mockResolvedValue([makeSong('42', 'Blue')]);
    const r = new Recommender(deps);
    const result = await r.fillQueueByPreference('jazz', 5);
    expect(deps.music.details).toHaveBeenCalledWith(['42']);
    expect(result.map(s => s.id)).toEqual(['42']);
  });

  it('falls back to search when seed pool insufficient', async () => {
    const deps = makeDeps();
    deps.music.search.mockResolvedValue([makeSong('10', 'JazzMan')]);
    const r = new Recommender(deps);
    r.topArtists = [{ name: 'JazzMan', count: 5 }];
    const result = await r.fillQueueByPreference('jazz', 5);
    expect(deps.music.search).toHaveBeenCalledWith('jazz', 15);
    expect(result.map(s => s.id)).toEqual(['10']);
  });

  it('falls back to generic fill when search insufficient', async () => {
    const deps = makeDeps();
    deps.music.personalFm.mockResolvedValue([makeSong('20')]);
    const r = new Recommender(deps);
    r.initialized = true;
    const result = await r.fillQueueByPreference('obscure', 3);
    expect(deps.music.personalFm).toHaveBeenCalled();
    // Bug fixed in QueueFillStrategies: generic fill songs are now returned
    expect(result.map(s => s.id)).toEqual(['20']);
  });

  it('deduplicates across all steps', async () => {
    const deps = makeDeps();
    deps.seedPool.all.mockReturnValue([{
      songId: '1', title: 'Jazz', artist: 'Blue',
      album: '', durationMs: 100, source: 'liked', genreTags: ['jazz'], playCount: 0,
    }]);
    deps.music.details.mockResolvedValue([makeSong('1')]);
    deps.music.search.mockResolvedValue([makeSong('1'), makeSong('2')]);
    const r = new Recommender(deps);
    r.topArtists = [{ name: 'Blue', count: 5 }];
    const result = await r.fillQueueByPreference('jazz', 5);
    expect(result.map(s => s.id)).toEqual(['1', '2']);
  });

  it('adds to queueStore when results non-empty', async () => {
    const deps = makeDeps();
    deps.music.search.mockResolvedValue([makeSong('10')]);
    const r = new Recommender(deps);
    r.topArtists = [{ name: 'A', count: 1 }];
    const result = await r.fillQueueByPreference('pop', 1);
    expect(deps.queueStore.addSongs).toHaveBeenCalledWith(result);
  });

  it('preserves plan progress during generic fill fallback', async () => {
    const deps = makeDeps();
    deps.music.personalFm.mockResolvedValue([makeSong('1')]);
    const r = new Recommender(deps);
    r.initialized = true;
    r._planProgress = { planId: 'p1', currentBlockIndex: 2, songsFilledInBlock: 3, autoMode: false, pinned: true };
    await r.fillQueueByPreference('obscure', 1);
    expect(r._planProgress.planId).toBe('p1');
    expect(r._planProgress.currentBlockIndex).toBe(2);
    expect(r._planProgress.autoMode).toBe(false);
    expect(r._planProgress.pinned).toBe(true);
  });

  it('returns empty when no preference and no strategies yield', async () => {
    const deps = makeDeps();
    const r = new Recommender(deps);
    const result = await r.fillQueueByPreference(null, 5);
    expect(result).toEqual([]);
  });

  it('fills up to targetSize combining seed pool and search', async () => {
    const deps = makeDeps();
    deps.seedPool.all.mockReturnValue([{
      songId: '1', title: 'Jazz1', artist: 'Blue',
      album: '', durationMs: 100, source: 'liked', genreTags: ['jazz'], playCount: 0,
    }]);
    deps.music.details.mockResolvedValue([makeSong('1')]);
    deps.music.search.mockResolvedValue([makeSong('2'), makeSong('3')]);
    const r = new Recommender(deps);
    r.topArtists = [{ name: 'Blue', count: 5 }];
    const result = await r.fillQueueByPreference('jazz', 3);
    expect(result).toHaveLength(3);
    expect(result.map(s => s.id)).toEqual(['1', '2', '3']);
  });
});

// ─── _buildSeedPool ──────────────────────────────────────────────

describe('_buildSeedPool characterization', () => {
  it('processes playlists and liked songs, stores to seedPoolRepo', async () => {
    const deps = makeDeps();
    deps.music.userPlaylists.mockResolvedValue([{ id: 'p1', name: 'Fav' }]);
    deps.music.playlistTracks.mockResolvedValue([makeSong('1', 'Artist A')]);
    deps.music.likedSongs.mockResolvedValue([makeSong('2', 'Artist B')]);
    const r = new Recommender(deps);
    r.uid = 'u1';
    await r._buildSeedPool();
    expect(deps.seedPool.upsert).toHaveBeenCalledTimes(2);
  });

  it('skips duplicate songs across playlists and liked', async () => {
    const deps = makeDeps();
    deps.music.userPlaylists.mockResolvedValue([{ id: 'p1', name: 'Fav' }]);
    deps.music.playlistTracks.mockResolvedValue([makeSong('1', 'Artist A')]);
    deps.music.likedSongs.mockResolvedValue([makeSong('1', 'Artist A')]); // same id
    const r = new Recommender(deps);
    r.uid = 'u1';
    await r._buildSeedPool();
    expect(deps.seedPool.upsert).toHaveBeenCalledTimes(1);
  });

  it('counts artists and updates profile', async () => {
    const deps = makeDeps();
    deps.music.userPlaylists.mockResolvedValue([{ id: 'p1', name: 'Fav' }]);
    deps.music.playlistTracks.mockResolvedValue([
      makeSong('1', '周杰伦'),
      makeSong('2', '周杰伦'),
      makeSong('3', 'Blue Trio'),
    ]);
    const r = new Recommender(deps);
    r.uid = 'u1';
    await r._buildSeedPool();
    expect(deps.profile.set).toHaveBeenCalledWith('topArtists', [
      { name: '周杰伦', count: 2 },
      { name: 'Blue Trio', count: 1 },
    ]);
  });

  it('handles playlist fetch error gracefully', async () => {
    const deps = makeDeps();
    deps.music.userPlaylists.mockResolvedValue([
      { id: 'p1', name: 'Fav' },
      { id: 'p2', name: 'Broken' },
    ]);
    deps.music.playlistTracks
      .mockResolvedValueOnce([makeSong('1')])
      .mockRejectedValueOnce(new Error('Network error'));
    deps.music.likedSongs.mockResolvedValue([]);
    const r = new Recommender(deps);
    r.uid = 'u1';
    await r._buildSeedPool();
    expect(deps.seedPool.upsert).toHaveBeenCalledTimes(1);
  });

  it('auto-fills taste.md when template', async () => {
    const deps = makeDeps();
    // isTasteTemplate returns true when no line starts with "- <non-space>"
    deps.corpus.readTaste.mockReturnValue('## Artists\n- ');
    deps.music.userPlaylists.mockResolvedValue([]);
    deps.music.likedSongs.mockResolvedValue([]);
    const r = new Recommender(deps);
    r.uid = 'u1';
    r.topArtists = [{ name: 'Test', count: 1 }];
    await r._buildSeedPool();
    expect(deps.corpus.writeTaste).toHaveBeenCalled();
  });

  it('does NOT overwrite taste.md when not template', async () => {
    const deps = makeDeps();
    // isTasteTemplate returns false when a line starts with "- <non-space>"
    deps.corpus.readTaste.mockReturnValue('# My Custom Taste\n- Real artist data');
    deps.music.userPlaylists.mockResolvedValue([]);
    deps.music.likedSongs.mockResolvedValue([]);
    const r = new Recommender(deps);
    r.uid = 'u1';
    await r._buildSeedPool();
    expect(deps.corpus.writeTaste).not.toHaveBeenCalled();
  });
});

// ─── fetch helpers (moved to QueueFillStrategies) ───────────────
// These tests verify Recommender delegates correctly to QueueFillStrategies.
// Direct strategy tests are in queue-fill-strategies.test.js

describe('fetch helpers via QueueFillStrategies delegation', () => {
  it('Recommender._createFiller returns QueueFillStrategies with correct deps', () => {
    const deps = makeDeps();
    const r = new Recommender(deps);
    r.topArtists = [{ name: 'Test', count: 1 }];
    const filler = r._createFiller();
    expect(filler.music).toBe(deps.music);
    expect(filler.queueStore).toBe(deps.queueStore);
    expect(filler.listenHistory).toBe(deps.listenHistory);
    expect(filler.topArtists).toEqual([{ name: 'Test', count: 1 }]);
  });
});

// ─── setPlanBlocks / getActiveBlock ──────────────────────────────

describe('plan progress management', () => {
  it('setPlanBlocks resets progress with new planId', () => {
    const r = new Recommender(makeDeps());
    r._planProgress.songsFilledInBlock = 99;
    r.setPlanBlocks([{ genreHints: ['rock'] }], 'plan-2');
    expect(r._planProgress).toEqual({
      planId: 'plan-2',
      currentBlockIndex: 0,
      songsFilledInBlock: 0,
      autoMode: true,
      pinned: false,
    });
  });

  it('getActiveBlock returns current plan progress', () => {
    const r = new Recommender(makeDeps());
    const block = r.getActiveBlock();
    expect(block).toBe(r._planProgress);
  });
});

// ─── P1-3/P1-4 regression: multi-strategy mixing + preference ranking ──

describe('P1-3/P1-4 regression: multi-strategy mixing and preference ranking', () => {
  it('includes songs from multiple strategies even when genreHints returns enough to fill targetSize', async () => {
    const deps = makeDeps();
    // genreHints path uses GenreSearchEngine which calls music.search
    deps.music.search.mockResolvedValue([
      makeSong('g1', 'GenreArtist'), makeSong('g2', 'GenreArtist'),
      makeSong('g3', 'GenreArtist'), makeSong('g4', 'GenreArtist'),
      makeSong('g5', 'GenreArtist'), makeSong('g6', 'GenreArtist'),
    ]);
    // personalFm returns different songs
    deps.music.personalFm.mockResolvedValue([
      makeSong('p1', 'FavArtist'), makeSong('p2', 'FavArtist'),
    ]);
    const r = new Recommender(deps);
    r.initialized = true;
    r.topArtists = [{ name: 'FavArtist', count: 10 }];

    const hints = [{ genreHints: ['jazz'], targetCount: 5 }];
    const result = await r.fillQueue(8, hints);

    // With perStrategyQuota, personalFm songs should be present
    const personalFmIds = result.filter(s => s.id.startsWith('p')).map(s => s.id);
    expect(personalFmIds.length).toBeGreaterThan(0);
  });

  it('ranks songs matching topArtists higher in fillQueue result', async () => {
    const deps = makeDeps();
    const favSong = makeSong('1', 'Jay Chou');
    const randomSong = makeSong('2', 'Unknown');
    const anotherFav = makeSong('3', 'Jay Chou');

    deps.music.personalFm.mockResolvedValue([randomSong, favSong, anotherFav]);
    const r = new Recommender(deps);
    r.initialized = true;
    r.topArtists = [{ name: 'Jay Chou', count: 5 }];

    const result = await r.fillQueue(3);
    // Jay Chou songs should be ranked first
    expect(result[0].artist).toBe('Jay Chou');
    expect(result[1].artist).toBe('Jay Chou');
  });

  it('does not let genreHints strategy dominate when other strategies have relevant songs', async () => {
    const deps = makeDeps();
    // genreHints returns 12 songs (enough to fill targetSize alone)
    const genreSongs = Array.from({ length: 12 }, (_, i) => makeSong(`g${i}`, 'GenreArtist'));
    deps.music.search.mockResolvedValue(genreSongs);
    // personalFm returns songs from user's top artist
    deps.music.personalFm.mockResolvedValue([
      makeSong('p1', 'TopArtist'), makeSong('p2', 'TopArtist'),
    ]);
    const r = new Recommender(deps);
    r.initialized = true;
    r.topArtists = [{ name: 'TopArtist', count: 10 }];

    const hints = [{ genreHints: ['rock'], targetCount: 5 }];
    const result = await r.fillQueue(10, hints);

    // Both genre and personal songs should be present
    const hasGenreSongs = result.some(s => s.id.startsWith('g'));
    const hasPersonalSongs = result.some(s => s.id.startsWith('p'));
    expect(hasGenreSongs).toBe(true);
    expect(hasPersonalSongs).toBe(true);
  });
});

// ─── getSongDetails ──────────────────────────────────────────────

describe('getSongDetails', () => {
  it('returns empty array for empty input', async () => {
    const r = new Recommender(makeDeps());
    const result = await r.getSongDetails([]);
    expect(result).toEqual([]);
  });

  it('delegates to music.details', async () => {
    const deps = makeDeps();
    deps.music.details.mockResolvedValue([makeSong('1')]);
    const r = new Recommender(deps);
    const result = await r.getSongDetails(['1']);
    expect(deps.music.details).toHaveBeenCalledWith(['1']);
    expect(result).toHaveLength(1);
  });

  it('returns empty array on error', async () => {
    const deps = makeDeps();
    deps.music.details.mockRejectedValue(new Error('fail'));
    const r = new Recommender(deps);
    const result = await r.getSongDetails(['1']);
    expect(result).toEqual([]);
  });
});
