import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SeedPoolBuilder, computeTopArtists } from '../domain/curation/SeedPoolBuilder.js';

describe('computeTopArtists — pure function', () => {
  it('returnsEmpty_whenNoArtists', () => {
    expect(computeTopArtists({})).toEqual([]);
  });

  it('returnsSortedByCount_descending', () => {
    const counts = { Beatles: 5, Stones: 8, Queen: 3 };
    const result = computeTopArtists(counts);
    expect(result[0]).toEqual({ name: 'Stones', count: 8 });
    expect(result[1]).toEqual({ name: 'Beatles', count: 5 });
    expect(result[2]).toEqual({ name: 'Queen', count: 3 });
  });

  it('limitsTo30_artists', () => {
    const counts = {};
    for (let i = 0; i < 50; i++) counts[`Artist${i}`] = i;
    expect(computeTopArtists(counts)).toHaveLength(30);
  });
});

describe('SeedPoolBuilder', () => {
  let builder;
  let musicMock;
  let seedPoolRepoMock;
  let profileMock;
  let corpusMock;

  beforeEach(() => {
    musicMock = {
      userPlaylists: vi.fn().mockResolvedValue([]),
      playlistTracks: vi.fn().mockResolvedValue([]),
      likedSongs: vi.fn().mockResolvedValue([]),
    };
    seedPoolRepoMock = {
      upsert: vi.fn(),
      all: vi.fn().mockReturnValue([]),
    };
    profileMock = {
      get: vi.fn().mockReturnValue({}),
      set: vi.fn(),
    };
    corpusMock = {
      readTaste: vi.fn().mockReturnValue('template'),
      writeTaste: vi.fn(),
      readRoutines: vi.fn().mockReturnValue('template'),
      writeRoutines: vi.fn(),
    };
    builder = new SeedPoolBuilder({ music: musicMock, seedPoolRepo: seedPoolRepoMock, profile: profileMock, corpus: corpusMock });
  });

  it('returnsEmpty_whenNoPlaylists', async () => {
    musicMock.userPlaylists.mockResolvedValue([]);
    const result = await builder.build('uid123');
    expect(result.songs).toBe(0);
    expect(result.topArtists).toEqual([]);
  });

  it('collectsPlaylistSongs_andUpsertsToRepo', async () => {
    musicMock.userPlaylists.mockResolvedValue([{ id: 'pl1', name: 'My Playlist' }]);
    musicMock.playlistTracks.mockResolvedValue([
      { id: 's1', ar: [{ name: 'Artist A' }], al: {}, dt: 180000 },
      { id: 's2', ar: [{ name: 'Artist B' }], al: {}, dt: 200000 },
    ]);
    musicMock.likedSongs.mockResolvedValue([]);

    await builder.build('uid123');
    expect(seedPoolRepoMock.upsert).toHaveBeenCalledTimes(2);
  });

  it('computesTopArtists_fromCollectedSongs', async () => {
    musicMock.userPlaylists.mockResolvedValue([{ id: 'pl1', name: 'P1' }]);
    musicMock.playlistTracks.mockResolvedValue([
      { id: 's1', ar: [{ name: 'Artist A' }], al: {}, dt: 180 },
      { id: 's2', ar: [{ name: 'Artist A' }], al: {}, dt: 180 },
      { id: 's3', ar: [{ name: 'Artist B' }], al: {}, dt: 180 },
    ]);
    musicMock.likedSongs.mockResolvedValue([]);

    const result = await builder.build('uid123');
    expect(result.topArtists[0]).toEqual({ name: 'Artist A', count: 2 });
    expect(result.topArtists[1]).toEqual({ name: 'Artist B', count: 1 });
  });

  it('collectsLikedSongs_intoSeedPool', async () => {
    musicMock.userPlaylists.mockResolvedValue([]);
    musicMock.likedSongs.mockResolvedValue([
      { id: 'l1', ar: [{ name: 'Artist C' }], al: {}, dt: 200 },
    ]);

    const result = await builder.build('uid123');
    expect(result.songs).toBe(1);
    expect(seedPoolRepoMock.upsert).toHaveBeenCalledOnce();
  });

  it('skipsDuplicateSongs_bySongId', async () => {
    const track = { id: 's1', ar: { name: 'Artist A' }, al: {}, dt: 180 };
    musicMock.userPlaylists.mockResolvedValue([{ id: 'pl1', name: 'P1' }]);
    musicMock.playlistTracks.mockResolvedValue([track]);
    musicMock.likedSongs.mockResolvedValue([track]); // Same song in liked

    await builder.build('uid123');
    expect(seedPoolRepoMock.upsert).toHaveBeenCalledOnce();
  });

  it('writesUserCorpus_whenTemplatesAreUnfilled', async () => {
    corpusMock.readTaste.mockReturnValue('# Taste Profile\n<!-- TEMPLATE -->');
    corpusMock.readRoutines.mockReturnValue('# Routines\n<!-- TEMPLATE -->');

    await builder.build('uid123');
    expect(corpusMock.writeTaste).toHaveBeenCalled();
    expect(corpusMock.writeRoutines).toHaveBeenCalled();
  });

  it('doesNotWriteCorpus_whenAlreadyFilled', async () => {
    corpusMock.readTaste.mockReturnValue('# My Taste\n- Artist A: 10 plays');
    corpusMock.readRoutines.mockReturnValue('# My Routines\nMorning: jazz\nGenre: jazz, electronic');

    await builder.build('uid123');
    expect(corpusMock.writeTaste).not.toHaveBeenCalled();
    expect(corpusMock.writeRoutines).not.toHaveBeenCalled();
  });

  it('handlesPlaylistFetchError_gracefully', async () => {
    musicMock.userPlaylists.mockResolvedValue([{ id: 'pl1', name: 'P1' }, { id: 'pl2', name: 'P2' }]);
    musicMock.playlistTracks
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce([{ id: 's1', ar: { name: 'Artist A' }, al: {}, dt: 180 }]);

    const result = await builder.build('uid123');
    expect(result.songs).toBe(1);
  });

  it('handlesLikedSongsError_gracefully', async () => {
    musicMock.userPlaylists.mockResolvedValue([]);
    musicMock.likedSongs.mockRejectedValue(new Error('auth failed'));

    const result = await builder.build('uid123');
    expect(result.songs).toBe(0);
  });

  it('limitsTo10Playlists', async () => {
    const playlists = Array.from({ length: 15 }, (_, i) => ({ id: `pl${i}`, name: `P${i}` }));
    musicMock.userPlaylists.mockResolvedValue(playlists);
    musicMock.playlistTracks.mockResolvedValue([]);

    await builder.build('uid123');
    expect(musicMock.playlistTracks).toHaveBeenCalledTimes(10);
  });

  it('returnsBuilderResult_withSongsCount_andTopArtists', async () => {
    musicMock.userPlaylists.mockResolvedValue([]);
    musicMock.likedSongs.mockResolvedValue([]);

    const result = await builder.build('uid123');
    expect(result).toHaveProperty('songs');
    expect(result).toHaveProperty('topArtists');
    expect(result.songs).toBe(0);
  });
});
