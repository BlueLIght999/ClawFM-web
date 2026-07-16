import { describe, it, expect, vi } from 'vitest';
import { createGenreSearchEngine, mergeAndRank } from '../domain/routing/GenreSearchEngine.js';

/**
 * 特征测试 —— GenreSearchEngine 三级并行搜索 + 融合排序。
 *
 * DDD 分层:
 * - domain: GenreSearchEngine 只依赖 MusicSourcePort 接口
 * - infrastructure: Adapter 提供 search/searchPlaylists/searchArtists/artistHotSongs
 *
 * TDD: 先测 mergeAndRank 纯函数，再测 createGenreSearchEngine 端到端（mock port）
 */
describe('GenreSearchEngine', () => {
  // ── mergeAndRank 纯函数测试 ──

  describe('mergeAndRank', () => {
    it('merges_results_from_three_sources', () => {
      const playlistSongs = [
        { id: '1', title: '夜に駆ける', artist: 'YOASOBI', playCount: 50000000 },
        { id: '2', title: 'Lemon', artist: '米津玄师', playCount: 30000000 },
      ];
      const artistSongs = [
        { id: '3', title: '群青', artist: 'YOASOBI', playCount: 20000000 },
        { id: '1', title: '夜に駆ける', artist: 'YOASOBI', playCount: 50000000 }, // duplicate
      ];
      const songSearch = [
        { id: '5', title: 'Pretender', artist: 'Official髭男dism', playCount: 10000000 },
      ];

      const result = mergeAndRank({
        playlistSongs,
        artistSongs,
        songSearch,
        seedArtists: ['YOASOBI', '米津玄师'],
      });

      // Dedup: 4 unique songs (id '1' appears twice)
      expect(result).toHaveLength(4);
      // Playlist source has highest weight
      expect(result[0].id).toBe('1');
      // Seed artist bonus pushes YOASOBI songs higher
      expect(result.find(s => s.id === '3')).toBeDefined();
    });

    it('deduplicates_by_song_id', () => {
      const song = { id: '42', title: 'Test', artist: 'A', playCount: 100 };
      const result = mergeAndRank({
        playlistSongs: [song],
        artistSongs: [{ ...song, playCount: 200 }],
        songSearch: [{ ...song, playCount: 300 }],
        seedArtists: [],
      });
      expect(result).toHaveLength(1);
      // Takes highest score version
      expect(result[0].id).toBe('42');
    });

    it('seed_artist_bonus_boosts_matching_songs', () => {
      const seedSong = { id: '1', title: 'A', artist: 'YOASOBI', playCount: 1000 };
      const nonSeedSong = { id: '2', title: 'B', artist: 'Unknown', playCount: 1000000 };

      const result = mergeAndRank({
        playlistSongs: [seedSong, nonSeedSong],
        artistSongs: [],
        songSearch: [],
        seedArtists: ['YOASOBI'],
      });

      // Seed artist song should rank higher despite lower play count
      expect(result[0].id).toBe('1');
    });

    it('play_count_bonus_applied', () => {
      const lowPlay = { id: '1', title: 'A', artist: 'X', playCount: 50000 };
      const highPlay = { id: '2', title: 'B', artist: 'X', playCount: 5000000 };

      const result = mergeAndRank({
        playlistSongs: [lowPlay, highPlay],
        artistSongs: [],
        songSearch: [],
        seedArtists: [],
      });

      // High play count should rank higher (both from playlist source, no seed bonus)
      expect(result[0].id).toBe('2');
    });

    it('handles_empty_inputs', () => {
      expect(mergeAndRank({})).toEqual([]);
      expect(mergeAndRank({ playlistSongs: [], artistSongs: [], songSearch: [] })).toEqual([]);
    });

    it('limits_results', () => {
      const songs = Array.from({ length: 20 }, (_, i) => ({
        id: String(i), title: `S${i}`, artist: 'A', playCount: 100 - i,
      }));
      const result = mergeAndRank({
        playlistSongs: songs,
        artistSongs: [],
        songSearch: [],
        seedArtists: [],
        limit: 5,
      });
      expect(result).toHaveLength(5);
    });

    it('source_weight_playlist_highest', () => {
      const playlistSong = { id: '1', title: 'A', artist: 'X', playCount: 0 };
      const artistSong = { id: '2', title: 'B', artist: 'X', playCount: 0 };
      const searchSong = { id: '3', title: 'C', artist: 'X', playCount: 0 };

      const result = mergeAndRank({
        playlistSongs: [playlistSong],
        artistSongs: [artistSong],
        songSearch: [searchSong],
        seedArtists: [],
      });

      // Same play count, no seed → source weight determines order
      expect(result[0].id).toBe('1'); // playlist (0.9)
      expect(result[1].id).toBe('2'); // artist (0.8)
      expect(result[2].id).toBe('3'); // search (0.5)
    });
  });

  // ── createGenreSearchEngine 端到端（mock port） ──

  describe('createGenreSearchEngine', () => {
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

    it('returns_empty_array_when_genre_not_in_dict', async () => {
      const port = createMockPort();
      const engine = createGenreSearchEngine(port);
      const result = await engine.search('nonexistentgenre');
      expect(result).toEqual([]);
    });

    it('searches_playlists_with_playlistQuery', async () => {
      const port = createMockPort({
        searchPlaylists: vi.fn().mockResolvedValue([
          { id: 'pl1', name: '日语流行精选', playCount: 9999999 },
        ]),
        getPlaylistTracks: vi.fn().mockResolvedValue([
          { id: 's1', title: '夜に駆ける', artist: 'YOASOBI', playCount: 50000000 },
        ]),
      });
      const engine = createGenreSearchEngine(port);
      const result = await engine.search('jpop');

      expect(port.searchPlaylists).toHaveBeenCalledWith('日语流行', expect.any(Number));
      expect(port.getPlaylistTracks).toHaveBeenCalledWith('pl1');
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].title).toBe('夜に駆ける');
    });

    it('searches_seedArtists_in_parallel', async () => {
      const port = createMockPort({
        search: vi.fn()
          .mockResolvedValueOnce([{ id: 's1', title: '夜に駆ける', artist: 'YOASOBI', playCount: 50000000 }])
          .mockResolvedValueOnce([{ id: 's2', title: 'Lemon', artist: '米津玄师', playCount: 30000000 }])
          .mockResolvedValue([]),
      });
      const engine = createGenreSearchEngine(port);
      const result = await engine.search('jpop');

      // search called with each seed artist
      const calls = port.search.mock.calls;
      expect(calls.some(c => c[0] === 'YOASOBI')).toBe(true);
      expect(calls.some(c => c[0] === '米津玄师')).toBe(true);
    });

    it('uses_enhancedQuery_for_song_fallback', async () => {
      const port = createMockPort({
        search: vi.fn().mockResolvedValue([]),
      });
      const engine = createGenreSearchEngine(port);
      await engine.search('jpop');

      // At least one search call uses the enhanced query
      const calls = port.search.mock.calls;
      const hasEnhanced = calls.some(c => c[0] === 'jpop 日语流行');
      expect(hasEnhanced).toBe(true);
    });

    it('returns_at_most_limit_songs', async () => {
      const manySongs = Array.from({ length: 30 }, (_, i) => ({
        id: `s${i}`, title: `Song${i}`, artist: 'X', playCount: 1000 - i,
      }));
      const port = createMockPort({
        searchPlaylists: vi.fn().mockResolvedValue([{ id: 'pl1', name: 'P', playCount: 999 }]),
        getPlaylistTracks: vi.fn().mockResolvedValue(manySongs),
        search: vi.fn().mockResolvedValue(manySongs),
      });
      const engine = createGenreSearchEngine(port);
      const result = await engine.search('jpop', { limit: 8 });
      expect(result.length).toBeLessThanOrEqual(8);
    });

    it('handles_api_failures_gracefully', async () => {
      const port = createMockPort({
        searchPlaylists: vi.fn().mockRejectedValue(new Error('API down')),
        getPlaylistTracks: vi.fn().mockRejectedValue(new Error('API down')),
        search: vi.fn()
          .mockResolvedValueOnce([{ id: 's1', title: 'Fallback', artist: 'X', playCount: 100 }]),
      });
      const engine = createGenreSearchEngine(port);
      const result = await engine.search('jpop');

      // Should not throw, returns whatever it can get
      expect(result.length).toBeGreaterThan(0);
    });

    it('artist_search_uses_genre_keyword_and_seedArtists', async () => {
      const port = createMockPort({
        searchArtists: vi.fn().mockResolvedValue([
          { id: 'a1', name: 'YOASOBI', songCount: 20 },
        ]),
        artistHotSongs: vi.fn().mockResolvedValue([
          { id: 's1', title: '夜に駆ける', artist: 'YOASOBI', playCount: 50000000 },
        ]),
        search: vi.fn().mockResolvedValue([]),
      });
      const engine = createGenreSearchEngine(port);
      const result = await engine.search('jpop');

      expect(port.searchArtists).toHaveBeenCalledWith('jpop', expect.any(Number));
      expect(port.artistHotSongs).toHaveBeenCalledWith('a1');
    });
  });
});
