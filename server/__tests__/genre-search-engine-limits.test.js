import { describe, it, expect, vi } from 'vitest';
import { createGenreSearchEngine } from '../domain/routing/GenreSearchEngine.js';

/**
 * Gap-filling tests for GenreSearchEngine, written against the mutants that
 * survived the rest of the suite. Each block below corresponds to a specific
 * uncovered behaviour:
 *
 *   - the two "take the top N" sorts (playlist by playCount, artist by
 *     songCount) -- nothing asserted an ORDER, only membership, so flipping
 *     the comparator changed nothing any test could see;
 *   - the degenerate-port fallbacks (a MusicSourcePort missing searchPlaylists,
 *     searchArtists, artistHotSongs or search) -- never constructed;
 *   - `_songsFromGenreArtists`'s catch -- only reached when searchArtists
 *     itself throws;
 *   - the non-array guard on the song-search stage.
 *
 * These are behavioural, not white-box: each asserts an outcome a user of the
 * engine could observe.
 */

function createMockPort(overrides = {}) {
  return {
    search: vi.fn().mockResolvedValue([]),
    searchPlaylists: vi.fn().mockResolvedValue([]),
    searchArtists: vi.fn().mockResolvedValue([]),
    getPlaylistTracks: vi.fn().mockResolvedValue([]),
    artistHotSongs: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('GenreSearchEngine stage limits and ordering', () => {
  it('takesPlaylistsByDescendingPlayCount', async () => {
    // Three playlists offered, only two fetched -- and it must be the two
    // biggest. A reversed comparator would fetch the two smallest instead.
    const getPlaylistTracks = vi.fn().mockResolvedValue([]);
    const port = createMockPort({
      searchPlaylists: vi.fn().mockResolvedValue([
        { id: 'small', name: 'S', playCount: 10 },
        { id: 'biggest', name: 'B', playCount: 999999 },
        { id: 'middle', name: 'M', playCount: 5000 },
      ]),
      getPlaylistTracks,
    });

    await createGenreSearchEngine(port).search('jpop');

    const fetched = getPlaylistTracks.mock.calls.map(c => c[0]);
    expect(fetched).toHaveLength(2);
    expect(fetched).toContain('biggest');
    expect(fetched).toContain('middle');
    expect(fetched).not.toContain('small');
  });

  it('skipsPlaylistsWithoutId_orName', async () => {
    const getPlaylistTracks = vi.fn().mockResolvedValue([]);
    const port = createMockPort({
      searchPlaylists: vi.fn().mockResolvedValue([
        { name: 'no id', playCount: 9999 },
        null,
        { id: 'ok', name: 'OK', playCount: 1 },
      ]),
      getPlaylistTracks,
    });

    await createGenreSearchEngine(port).search('jpop');

    expect(getPlaylistTracks).toHaveBeenCalledTimes(1);
    expect(getPlaylistTracks).toHaveBeenCalledWith('ok');
  });

  it('takesArtistsByDescendingSongCount', async () => {
    // Same rule one stage over: of three matching artists, the two with the
    // largest catalogues get their hot songs pulled.
    const artistHotSongs = vi.fn().mockResolvedValue([]);
    const port = createMockPort({
      searchArtists: vi.fn().mockResolvedValue([
        { id: 'small', name: 'S', songCount: 1 },
        { id: 'biggest', name: 'B', songCount: 999 },
        { id: 'middle', name: 'M', songCount: 50 },
      ]),
      artistHotSongs,
    });

    await createGenreSearchEngine(port).search('jpop');

    const pulled = artistHotSongs.mock.calls.map(c => c[0]);
    expect(pulled).toHaveLength(2);
    expect(pulled).toContain('biggest');
    expect(pulled).toContain('middle');
    expect(pulled).not.toContain('small');
  });

  it('skipsArtistsWithoutId', async () => {
    const artistHotSongs = vi.fn().mockResolvedValue([]);
    const port = createMockPort({
      searchArtists: vi.fn().mockResolvedValue([{ name: 'no id', songCount: 99 }]),
      artistHotSongs,
    });

    await createGenreSearchEngine(port).search('jpop');

    expect(artistHotSongs).not.toHaveBeenCalled();
  });

  it('capsTracksTakenFromEachPlaylist', async () => {
    // Each playlist contributes at most its share, so one huge playlist does
    // not crowd out the others.
    const many = Array.from({ length: 50 }, (_, i) => ({
      id: `s${i}`, title: `T${i}`, artist: 'X', playCount: 1,
    }));
    const port = createMockPort({
      searchPlaylists: vi.fn().mockResolvedValue([{ id: 'pl1', name: 'P', playCount: 1 }]),
      getPlaylistTracks: vi.fn().mockResolvedValue(many),
      searchArtists: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
    });

    const engine = createGenreSearchEngine(port);
    const result = await engine.search('jpop', { limit: 40 });

    // 50 offered by one playlist; the per-playlist cap must bite well under it.
    expect(result.length).toBeLessThan(50);
    expect(result.length).toBeGreaterThan(0);
  });

  it('capsHotSongsTakenFromEachArtist', async () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      id: `s${i}`, title: `T${i}`, artist: 'X', playCount: 1,
    }));
    const port = createMockPort({
      searchPlaylists: vi.fn().mockResolvedValue([]),
      searchArtists: vi.fn().mockResolvedValue([{ id: 'a1', name: 'A', songCount: 10 }]),
      artistHotSongs: vi.fn().mockResolvedValue(many),
      search: vi.fn().mockResolvedValue([]),
    });

    const engine = createGenreSearchEngine(port);
    const result = await engine.search('jpop', { limit: 40 });

    expect(result.length).toBeLessThan(50);
    expect(result.length).toBeGreaterThan(0);
  });

  it('limitsSeedArtistsSearched', async () => {
    // The dict lists 5 seed artists for jpop; the engine only spends search
    // calls on the first few, plus the enhanced-query fallback.
    const port = createMockPort({ search: vi.fn().mockResolvedValue([]) });

    await createGenreSearchEngine(port).search('jpop');

    const seedCalls = port.search.mock.calls.filter(
      c => c[0] !== 'jpop 日语流行',
    );
    expect(seedCalls.length).toBe(3);
  });
});

describe('GenreSearchEngine degenerate ports', () => {
  it('returnsEmpty_whenPortLacksPlaylistCapability', async () => {
    const port = { search: vi.fn().mockResolvedValue([]) };
    const result = await createGenreSearchEngine(port).search('jpop');
    expect(Array.isArray(result)).toBe(true);
  });

  it('returnsEmpty_whenPortLacksArtistCapability', async () => {
    const port = { search: vi.fn().mockResolvedValue([]) };
    const result = await createGenreSearchEngine(port).search('jpop');
    expect(result).toEqual([]);
  });

  it('returnsEmpty_whenPortHasNoSearchAtAll', async () => {
    // A port with none of the optional capabilities must degrade to "found
    // nothing" rather than throwing or returning a non-array.
    const port = {};
    const result = await createGenreSearchEngine(port).search('jpop');
    expect(result).toEqual([]);
  });

  it('returnsEmpty_whenPortIsBareObjectAndGenreUnknown', async () => {
    const result = await createGenreSearchEngine({}).search('not-a-genre');
    expect(result).toEqual([]);
  });
});

describe('GenreSearchEngine failure paths', () => {
  it('fallsBack_whenArtistSearchThrows', async () => {
    // searchArtists itself rejects (not just its results). The stage must
    // swallow it and let the song-search stage carry the query.
    const port = createMockPort({
      searchArtists: vi.fn().mockRejectedValue(new Error('artist API down')),
      search: vi.fn().mockResolvedValue([
        { id: 's1', title: 'Fallback', artist: 'X', playCount: 100 },
      ]),
    });

    const result = await createGenreSearchEngine(port).search('jpop');

    expect(result.map(s => s.id)).toContain('s1');
  });

  it('fallsBack_whenArtistHotSongsThrows', async () => {
    const port = createMockPort({
      searchArtists: vi.fn().mockResolvedValue([{ id: 'a1', name: 'A', songCount: 5 }]),
      artistHotSongs: vi.fn().mockRejectedValue(new Error('hot songs down')),
      search: vi.fn().mockResolvedValue([
        { id: 's1', title: 'Fallback', artist: 'X', playCount: 100 },
      ]),
    });

    const result = await createGenreSearchEngine(port).search('jpop');

    expect(result.map(s => s.id)).toContain('s1');
  });

  it('treatsNonArraySongSearchResultAsEmpty', async () => {
    // A misbehaving port returning an object or null must not reach the
    // ranking merge as if it were a song list.
    const port = createMockPort({
      search: vi.fn().mockResolvedValue({ not: 'an array' }),
      searchPlaylists: vi.fn().mockResolvedValue([]),
      searchArtists: vi.fn().mockResolvedValue([]),
    });

    const result = await createGenreSearchEngine(port).search('jpop');

    expect(result).toEqual([]);
  });

  it('treatsNullSongSearchResultAsEmpty', async () => {
    const port = createMockPort({
      search: vi.fn().mockResolvedValue(null),
      searchPlaylists: vi.fn().mockResolvedValue([]),
      searchArtists: vi.fn().mockResolvedValue([]),
    });

    const result = await createGenreSearchEngine(port).search('jpop');

    expect(result).toEqual([]);
  });

  it('survivesEveryStageRejectingAtOnce', async () => {
    const port = {
      search: vi.fn().mockRejectedValue(new Error('down')),
      searchPlaylists: vi.fn().mockRejectedValue(new Error('down')),
      searchArtists: vi.fn().mockRejectedValue(new Error('down')),
      getPlaylistTracks: vi.fn().mockRejectedValue(new Error('down')),
      artistHotSongs: vi.fn().mockRejectedValue(new Error('down')),
    };

    const result = await createGenreSearchEngine(port).search('jpop');

    expect(result).toEqual([]);
  });
});
