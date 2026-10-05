import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Recommender } from '../services/recommender.js';
import { QueueFillStrategies } from '../domain/curation/QueueFillStrategies.js';

// Mock queue module
vi.mock('../services/queue.js', () => ({
  queue: {
    isEmpty: false,
    hasCurrent: true,
    current: null,
    upcomingSongs: [],
    length: 0,
    mode: 'normal',
    addSongs: vi.fn(),
    advance: vi.fn(() => null),
    goBack: vi.fn(() => null),
    persist: vi.fn(),
  },
}));

import { queue } from '../services/queue.js';

describe('Recommender Characterization — recommendation behavior invariants', () => {
  let recommender;
  let mockMusic;
  let mockListenHistory;
  let mockProfile;
  let mockSeedPool;
  let mockCorpus;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    mockMusic = {
      personalFm: vi.fn().mockResolvedValue([]),
      similar: vi.fn().mockResolvedValue([]),
      dailyRecommend: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
      details: vi.fn().mockResolvedValue([]),
      userPlaylists: vi.fn().mockResolvedValue([]),
      playlistTracks: vi.fn().mockResolvedValue([]),
      likedSongs: vi.fn().mockResolvedValue([]),
      scrobble: vi.fn().mockResolvedValue(undefined),
    };
    mockListenHistory = {
      recentSongIds: vi.fn(() => []),
      artistPlayCount: vi.fn(() => []),
      record: vi.fn(),
    };
    mockProfile = {
      get: vi.fn(() => ({ topArtists: [], topGenres: [] })),
      set: vi.fn(),
    };
    mockSeedPool = {
      all: vi.fn(() => []),
      upsert: vi.fn(),
    };
    mockCorpus = {
      readTaste: vi.fn(() => ''),
      writeTaste: vi.fn(),
      readRoutines: vi.fn(() => ''),
      writeRoutines: vi.fn(),
    };

    recommender = new Recommender({
      music: mockMusic,
      listenHistory: mockListenHistory,
      seedPool: mockSeedPool,
      profile: mockProfile,
      corpus: mockCorpus,
    });
  });

  describe('init — dependency configuration', () => {
    it('initializes with uid and profile data', async () => {
      mockProfile.get.mockReturnValue({ topArtists: [{ name: 'Artist1' }], topGenres: ['jazz'] });
      await recommender.init('user123');
      expect(recommender.uid).toBe('user123');
      expect(recommender.topArtists).toEqual([{ name: 'Artist1' }]);
      expect(recommender.topGenres).toEqual(['jazz']);
      expect(recommender.initialized).toBe(true);
    });

    it('does not initialize when profile is missing', async () => {
      const r = new Recommender({ music: mockMusic, listenHistory: mockListenHistory });
      await r.init('user123');
      expect(r.initialized).toBe(false);
    });

    it('does not initialize when music is missing', async () => {
      const r = new Recommender({ listenHistory: mockListenHistory, profile: mockProfile });
      await r.init('user123');
      expect(r.initialized).toBe(false);
    });
  });

  describe('fillQueue — queue filling lifecycle', () => {
    it('returns empty array when not initialized', async () => {
      const result = await recommender.fillQueue(15);
      expect(result).toEqual([]);
    });

    it('commits filled songs to queue store', async () => {
      await recommender.init('user123');
      const songs = [{ id: 's1' }, { id: 's2' }];
      vi.spyOn(QueueFillStrategies.prototype, 'fillQueue').mockResolvedValue({
        allSongs: songs,
        activeBlockHints: null,
      });

      await recommender.fillQueue(15);
      expect(queue.addSongs).toHaveBeenCalledWith(songs);
    });

    it('triggers seed pool build after first fillQueue', async () => {
      await recommender.init('user123');
      vi.spyOn(QueueFillStrategies.prototype, 'fillQueue').mockResolvedValue({
        allSongs: [{ id: 's1' }],
        activeBlockHints: null,
      });
      vi.spyOn(recommender, '_buildSeedPool').mockResolvedValue();

      await recommender.fillQueue(15);
      expect(recommender._buildSeedPool).toHaveBeenCalled();
    });

    it('does not trigger seed pool build on subsequent fills', async () => {
      await recommender.init('user123');
      vi.spyOn(QueueFillStrategies.prototype, 'fillQueue').mockResolvedValue({
        allSongs: [{ id: 's1' }],
        activeBlockHints: null,
      });
      const buildSpy = vi.spyOn(recommender, '_buildSeedPool').mockResolvedValue();

      await recommender.fillQueue(15);
      await recommender.fillQueue(15);
      expect(buildSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('onBlockActivated — DJ 播到某歌单（F4 触发）', () => {
    const blocks = [
      { theme: '晨光微醒', genreHints: ['pop'], targetCount: 6 },
      { theme: '城市节拍', genreHints: ['folk'], targetCount: 7 },
    ];

    function fillWith(block) {
      return vi.spyOn(QueueFillStrategies.prototype, 'fillQueue').mockResolvedValue({
        allSongs: [{ id: 's1' }],
        activeBlockHints: block ? [block] : null,
      });
    }

    it('announcesABlockOnceWhenItFirstEntersTheQueue', async () => {
      await recommender.init('user123');
      vi.spyOn(recommender, '_buildSeedPool').mockResolvedValue();
      const seen = [];
      recommender.onBlockActivated((a) => seen.push(a));
      recommender.setPlanBlocks(blocks, 'plan-1');
      fillWith(blocks[0]);

      await recommender.fillQueue(15, blocks);
      await recommender.fillQueue(15, blocks);

      expect(seen).toEqual([{ planId: 'plan-1', blockIndex: 0, block: blocks[0] }]);
    });

    it('announcesAgainWhenProgressionMovesToTheNextBlock', async () => {
      await recommender.init('user123');
      vi.spyOn(recommender, '_buildSeedPool').mockResolvedValue();
      const seen = [];
      recommender.onBlockActivated((a) => seen.push(a.blockIndex));
      recommender.setPlanBlocks(blocks, 'plan-1');
      fillWith(blocks[0]);
      await recommender.fillQueue(15, blocks);

      recommender._planProgress.currentBlockIndex = 1;
      fillWith(blocks[1]);
      await recommender.fillQueue(15, blocks);

      expect(seen).toEqual([0, 1]);
    });

    it('announcesANewPlanEvenWithoutAPlanId', async () => {
      // recurringTasks / agent 工具换计划时不传 planId：块 0 换了主题也得算新块
      await recommender.init('user123');
      vi.spyOn(recommender, '_buildSeedPool').mockResolvedValue();
      const seen = [];
      recommender.onBlockActivated((a) => seen.push(a.block.theme));
      recommender.setPlanBlocks(blocks);
      fillWith(blocks[0]);
      await recommender.fillQueue(15, blocks);

      const next = [{ theme: '深夜电台', genreHints: ['ambient'] }];
      recommender.setPlanBlocks(next);
      fillWith(next[0]);
      await recommender.fillQueue(15, next);

      expect(seen).toEqual(['晨光微醒', '深夜电台']);
    });

    it('staysSilentWhenTheFillAddedNothingOrHadNoBlock', async () => {
      // 没有歌真正进队列，就谈不上「播到」这个歌单
      await recommender.init('user123');
      vi.spyOn(recommender, '_buildSeedPool').mockResolvedValue();
      const seen = [];
      recommender.onBlockActivated((a) => seen.push(a));
      vi.spyOn(QueueFillStrategies.prototype, 'fillQueue').mockResolvedValue({ allSongs: [], activeBlockHints: [blocks[0]] });
      await recommender.fillQueue(15, blocks);
      fillWith(null);
      await recommender.fillQueue(15);

      expect(seen).toEqual([]);
    });

    it('keepsFillingWhenTheListenerThrows', async () => {
      // 分发是增强：它出错不能让电台停止补队列
      await recommender.init('user123');
      vi.spyOn(recommender, '_buildSeedPool').mockResolvedValue();
      recommender.onBlockActivated(() => { throw new Error('boom'); });
      recommender.setPlanBlocks(blocks, 'plan-1');
      fillWith(blocks[0]);

      await expect(recommender.fillQueue(15, blocks)).resolves.toEqual([{ id: 's1' }]);
    });
  });

  describe('fillQueueByPreference — preference-based filling', () => {
    it('adds songs to queue when results available', async () => {
      const songs = [{ id: 's1' }, { id: 's2' }];
      vi.spyOn(QueueFillStrategies.prototype, 'fillQueueByPreference').mockResolvedValue(songs);

      await recommender.fillQueueByPreference('jazz', 10);
      expect(queue.addSongs).toHaveBeenCalledWith(songs);
    });

    it('does not add songs when results empty', async () => {
      vi.spyOn(QueueFillStrategies.prototype, 'fillQueueByPreference').mockResolvedValue([]);

      await recommender.fillQueueByPreference('jazz', 10);
      expect(queue.addSongs).not.toHaveBeenCalled();
    });
  });

  describe('setPlanBlocks — plan progress management', () => {
    it('resets plan progress with new blocks', () => {
      recommender.setPlanBlocks([{ genreHints: ['jazz'] }], 'plan-001');
      expect(recommender.getActiveBlock()).toEqual({
        planId: 'plan-001',
        currentBlockIndex: 0,
        songsFilledInBlock: 0,
        autoMode: true,
        pinned: false,
      });
    });

    it('overwrites existing plan progress', () => {
      recommender.setPlanBlocks([{ genreHints: ['jazz'] }], 'plan-001');
      recommender.setPlanBlocks([{ genreHints: ['rock'] }], 'plan-002');
      expect(recommender.getActiveBlock().planId).toBe('plan-002');
    });
  });

  describe('getSongDetails — detail fetching', () => {
    it('returns empty array for empty ids', async () => {
      const result = await recommender.getSongDetails([]);
      expect(result).toEqual([]);
    });

    it('fetches details from music port', async () => {
      mockMusic.details.mockResolvedValue([{ id: 's1', name: 'Song' }]);
      const result = await recommender.getSongDetails(['s1']);
      expect(result).toEqual([{ id: 's1', name: 'Song' }]);
    });

    it('returns empty array on fetch error', async () => {
      mockMusic.details.mockRejectedValue(new Error('network'));
      const result = await recommender.getSongDetails(['s1']);
      expect(result).toEqual([]);
    });
  });

  describe('configure — dependency injection', () => {
    it('updates music dependency', () => {
      const newMusic = { ...mockMusic, updated: true };
      recommender.configure({ music: newMusic });
      expect(recommender.music).toBe(newMusic);
    });

    it('updates listenHistory dependency', () => {
      const newHistory = { ...mockListenHistory, updated: true };
      recommender.configure({ listenHistory: newHistory });
      expect(recommender.listenHistory).toBe(newHistory);
    });

    it('preserves existing deps when not provided', () => {
      recommender.configure({});
      expect(recommender.music).toBe(mockMusic);
      expect(recommender.listenHistory).toBe(mockListenHistory);
    });
  });
});

describe('QueueFillStrategies Characterization — strategy collection invariants', () => {
  let strategies;
  let mockMusic;
  let mockListenHistory;
  let mockQueueStore;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mockMusic = {
      personalFm: vi.fn().mockResolvedValue([{ id: 'pf1' }]),
      similar: vi.fn().mockResolvedValue([{ id: 'sim1' }]),
      dailyRecommend: vi.fn().mockResolvedValue([{ id: 'daily1' }]),
      search: vi.fn().mockResolvedValue([{ id: 'search1' }]),
      details: vi.fn().mockResolvedValue([]),
    };
    mockListenHistory = {
      recentSongIds: vi.fn(() => []),
      artistPlayCount: vi.fn(() => []),
    };
    mockQueueStore = {
      current: { id: 'current1' },
      addSongs: vi.fn(),
    };

    strategies = new QueueFillStrategies({
      music: mockMusic,
      queueStore: mockQueueStore,
      listenHistory: mockListenHistory,
      topArtists: [{ name: 'TestArtist' }],
    });
  });

  describe('buildStrategies — strategy list construction', () => {
    it('returns 4 strategies when no active block hints', () => {
      const { strategies: fns, strategyNames } = strategies.buildStrategies(null, new Set(), new Set());
      expect(fns).toHaveLength(4);
      expect(strategyNames).toEqual(['personalFm', 'similarSongs', 'dailyRecs', 'genreSearch']);
    });

    it('returns 5 strategies when active block hints present', () => {
      const { strategies: fns, strategyNames } = strategies.buildStrategies(
        [{ genreHints: ['jazz'] }], new Set(), new Set(),
      );
      expect(fns).toHaveLength(5);
      expect(strategyNames[0]).toBe('genreHints');
    });
  });

  describe('collectFromStrategies — parallel collection + dedup', () => {
    it('deduplicates songs by id across strategies', async () => {
      const { collectFromStrategies } = await import('../domain/curation/QueueFillStrategies.js');
      const recentIds = new Set();
      const strategies = [
        async () => [{ id: 's1' }, { id: 's2' }],
        async () => [{ id: 's2' }, { id: 's3' }], // s2 is duplicate
      ];
      const result = await collectFromStrategies(strategies, ['a', 'b'], recentIds, 10);
      expect(result).toHaveLength(3);
      expect(result.map(s => s.id)).toEqual(['s1', 's2', 's3']);
    });

    it('respects targetSize limit', async () => {
      const { collectFromStrategies } = await import('../domain/curation/QueueFillStrategies.js');
      const recentIds = new Set();
      const strategies = [
        async () => [{ id: 's1' }, { id: 's2' }, { id: 's3' }, { id: 's4' }],
      ];
      const result = await collectFromStrategies(strategies, ['a'], recentIds, 2);
      expect(result).toHaveLength(2);
    });

    it('handles strategy failures gracefully', async () => {
      const { collectFromStrategies } = await import('../domain/curation/QueueFillStrategies.js');
      const recentIds = new Set();
      const strategies = [
        async () => { throw new Error('fail'); },
        async () => [{ id: 's1' }],
      ];
      const result = await collectFromStrategies(strategies, ['fail', 'ok'], recentIds, 10);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('s1');
    });

    it('skips songs already in recentIds', async () => {
      const { collectFromStrategies } = await import('../domain/curation/QueueFillStrategies.js');
      const recentIds = new Set(['s1']);
      const strategies = [
        async () => [{ id: 's1' }, { id: 's2' }],
      ];
      const result = await collectFromStrategies(strategies, ['a'], recentIds, 10);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('s2');
    });
  });

  describe('strategy implementations — error resilience', () => {
    it('fetchPersonalFm returns empty array on error', async () => {
      mockMusic.personalFm.mockRejectedValue(new Error('fail'));
      const result = await strategies.fetchPersonalFm(new Set(), new Set());
      expect(result).toEqual([]);
    });

    it('fetchSimilarSongs returns empty array when no current song', async () => {
      mockQueueStore.current = null;
      const result = await strategies.fetchSimilarSongs(new Set(), new Set());
      expect(result).toEqual([]);
    });

    it('fetchSimilarSongs returns empty array on error', async () => {
      mockMusic.similar.mockRejectedValue(new Error('fail'));
      const result = await strategies.fetchSimilarSongs(new Set(), new Set());
      expect(result).toEqual([]);
    });

    it('fetchDailyRecommendations returns empty array on error', async () => {
      mockMusic.dailyRecommend.mockRejectedValue(new Error('fail'));
      const result = await strategies.fetchDailyRecommendations(new Set(), new Set());
      expect(result).toEqual([]);
    });

    it('fetchGenreSearch returns empty array when no topArtists', async () => {
      strategies.topArtists = [];
      const result = await strategies.fetchGenreSearch(new Set(), new Set());
      expect(result).toEqual([]);
    });
  });
});
