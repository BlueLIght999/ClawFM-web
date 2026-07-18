import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueueFillStrategies, collectFromStrategies } from '../domain/curation/QueueFillStrategies.js';

describe('collectFromStrategies — pure dedup logic', () => {
  it('returnsEmpty_whenAllStrategiesReturnEmpty', async () => {
    const result = await collectFromStrategies(
      [async () => [], async () => []],
      ['a', 'b'],
      new Set(),
      10,
    );
    expect(result).toEqual([]);
  });

  it('deduplicatesByRecentIds', async () => {
    const result = await collectFromStrategies(
      [async () => [{ id: '1' }, { id: '2' }], async () => [{ id: '2' }, { id: '3' }]],
      ['a', 'b'],
      new Set(['2']),
      10,
    );
    expect(result.map(s => s.id)).toEqual(['1', '3']);
  });

  it('stopsAtTargetSize', async () => {
    const result = await collectFromStrategies(
      [async () => [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }]],
      ['a'],
      new Set(),
      2,
    );
    expect(result).toHaveLength(2);
  });

  it('deduplicatesAcrossStrategies', async () => {
    const result = await collectFromStrategies(
      [async () => [{ id: '1' }, { id: '2' }], async () => [{ id: '1' }, { id: '3' }]],
      ['a', 'b'],
      new Set(),
      10,
    );
    expect(result.map(s => s.id)).toEqual(['1', '2', '3']);
  });

  it('handlesStrategyErrors_returnsEmptyForFailedStrategy', async () => {
    const result = await collectFromStrategies(
      [async () => { throw new Error('fail'); }, async () => [{ id: '1' }]],
      ['a', 'b'],
      new Set(),
      10,
    );
    expect(result.map(s => s.id)).toEqual(['1']);
  });
});

describe('QueueFillStrategies', () => {
  let strategies;
  let musicMock;
  let queueStoreMock;
  let listenHistoryMock;
  let topArtists;

  beforeEach(() => {
    musicMock = {
      personalFm: vi.fn().mockResolvedValue([]),
      similar: vi.fn().mockResolvedValue([]),
      dailyRecommend: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
    };
    queueStoreMock = {
      current: { id: 'current-song' },
    };
    listenHistoryMock = {
      recentSongIds: vi.fn().mockReturnValue([]),
      artistPlayCount: vi.fn().mockReturnValue([]),
    };
    topArtists = [{ name: 'Artist A', count: 5 }];
    strategies = new QueueFillStrategies({
      music: musicMock,
      queueStore: queueStoreMock,
      listenHistory: listenHistoryMock,
      topArtists,
    });
  });

  it('fetchPersonalFm_callsMusicPort', async () => {
    musicMock.personalFm.mockResolvedValue([{ id: '1', ar: [{ name: 'X' }] }]);
    const result = await strategies.fetchPersonalFm(new Set(), new Set());
    expect(musicMock.personalFm).toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });

  it('fetchPersonalFm_filtersHourArtists', async () => {
    musicMock.personalFm.mockResolvedValue([
      { id: '1', ar: [{ name: 'Overplayed' }] },
      { id: '2', ar: [{ name: 'NewArtist' }] },
    ]);
    const result = await strategies.fetchPersonalFm(new Set(), new Set(['Overplayed']));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('fetchSimilarSongs_usesCurrentSongId', async () => {
    musicMock.similar.mockResolvedValue([{ id: 'sim1' }]);
    const result = await strategies.fetchSimilarSongs(new Set(), new Set());
    expect(musicMock.similar).toHaveBeenCalledWith(expect.any(String));
    expect(result).toHaveLength(1);
  });

  it('fetchSimilarSongs_returnsEmpty_whenNoCurrentSong', async () => {
    strategies.queueStore = { current: null };
    const result = await strategies.fetchSimilarSongs(new Set(), new Set());
    expect(result).toEqual([]);
  });

  it('fetchDailyRecommendations_callsMusicPort', async () => {
    musicMock.dailyRecommend.mockResolvedValue([{ id: 'd1' }, { id: 'd2' }]);
    const result = await strategies.fetchDailyRecommendations(new Set(), new Set());
    expect(result).toHaveLength(2);
  });

  it('fetchGenreSearch_usesRandomTopArtist', async () => {
    musicMock.search.mockResolvedValue([{ id: 'g1' }]);
    const result = await strategies.fetchGenreSearch(new Set(), new Set());
    expect(musicMock.search).toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });

  it('fetchGenreSearch_returnsEmpty_whenNoTopArtists', async () => {
    strategies.topArtists = [];
    const result = await strategies.fetchGenreSearch(new Set(), new Set());
    expect(result).toEqual([]);
  });

  it('buildStrategies_returnsAllFour_withoutHints', () => {
    const { strategies: fns, strategyNames } = strategies.buildStrategies(null, new Set(), new Set());
    expect(fns).toHaveLength(4);
    expect(strategyNames).toEqual(['personalFm', 'similarSongs', 'dailyRecs', 'genreSearch']);
  });

  it('buildStrategies_includesGenreHints_whenProvided', () => {
    const { strategies: fns, strategyNames } = strategies.buildStrategies([{ genreHints: ['jazz'] }], new Set(), new Set());
    expect(fns).toHaveLength(5);
    expect(strategyNames[0]).toBe('genreHints');
  });

  it('fillQueue_collectsFromAllStrategies', async () => {
    musicMock.personalFm.mockResolvedValue([{ id: '1', ar: [{ name: 'A' }] }]);
    musicMock.similar.mockResolvedValue([{ id: '2' }]);
    musicMock.dailyRecommend.mockResolvedValue([{ id: '3' }]);
    musicMock.search.mockResolvedValue([{ id: '4' }]);

    const { allSongs } = await strategies.fillQueue(5, null, { currentBlockIndex: 0, songsFilledInBlock: 0, autoMode: true });
    expect(allSongs.length).toBeGreaterThan(0);
    expect(allSongs.length).toBeLessThanOrEqual(5);
  });

  it('fillQueueByPreference_usesSeedPoolFirst', async () => {
    const seedPoolRepo = { all: vi.fn().mockReturnValue([]) };
    strategies.seedPoolRepo = seedPoolRepo;
    musicMock.search.mockResolvedValue([{ id: '1' }]);

    await strategies.fillQueueByPreference('jazz', 5, seedPoolRepo);
    expect(seedPoolRepo.all).toHaveBeenCalled();
  });
});
