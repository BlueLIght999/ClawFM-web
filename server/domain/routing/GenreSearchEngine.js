/**
 * GenreSearchEngine — three-stage parallel genre search with fusion ranking.
 *
 * DDD: Domain layer. Depends only on MusicSourcePort interface (injected).
 * No knowledge of NetEase API specifics.
 *
 * Pipeline:
 *   Stage 1 (playlist): searchPlaylists → getPlaylistTracks → songs
 *   Stage 2 (artist):   searchArtists → artistHotSongs + seedArtists direct search
 *   Stage 3 (fallback): search with enhancedQuery
 *
 * All three stages run in parallel (Promise.allSettled).
 * Results are merged, deduplicated, and ranked by:
 *   totalScore = sourceWeight + playCountBonus + seedArtistBonus
 */
import { matchGenre } from './genreDict.js';

// Source weights — playlist tracks are curated, artist songs are representative,
// song search is a catch-all.
const SOURCE_WEIGHT = {
  playlist: 0.9,
  artist: 0.8,
  search: 0.5,
};

// Play count bonus thresholds
const PLAY_BONUS_1M = 0.1;    // playCount > 1,000,000
const PLAY_BONUS_10M = 0.15;  // playCount > 10,000,000

// Seed artist bonus — song's artist matches a seed artist in genreDict
const SEED_BONUS = 0.2;

// Defaults
const DEFAULT_LIMIT = 15;
const DEFAULT_PLAYLIST_SEARCH_LIMIT = 2;     // top 2 playlists
const DEFAULT_PLAYLIST_TRACK_LIMIT = 10;     // 10 tracks per playlist
const DEFAULT_ARTIST_SEARCH_LIMIT = 2;       // top 2 artists from keyword search
const DEFAULT_ARTIST_SONG_LIMIT = 5;         // 5 hot songs per artist
const DEFAULT_SONG_SEARCH_LIMIT = 10;        // 10 songs from enhanced query
const DEFAULT_SEED_ARTIST_SEARCH_LIMIT = 3;  // 3 songs per seed artist

/**
 * Merge and rank songs from three sources.
 * @param {object} params
 * @param {Array} params.playlistSongs — songs from playlist tracks
 * @param {Array} params.artistSongs — songs from artist hot songs
 * @param {Array} params.songSearch — songs from enhanced song search
 * @param {string[]} params.seedArtists — genre's representative artists
 * @param {number} [params.limit=15] — max results
 * @returns {Array} ranked, deduplicated songs
 */
export function mergeAndRank({ playlistSongs = [], artistSongs = [], songSearch = [], seedArtists = [], limit = DEFAULT_LIMIT } = {}) {
  const seedSet = new Set((seedArtists || []).map(a => a.toLowerCase()));
  const seen = new Map(); // songId → { song, score }

  /**
   * Score and collect a batch of songs from a given source.
   * @param {Array} songs
   * @param {number} sourceWeight
   */
  function collect(songs, sourceWeight) {
    for (const song of songs) {
      if (!song || !song.id) continue;
      const sid = String(song.id);

      let score = sourceWeight;

      // Play count bonus
      const playCount = song.playCount || 0;
      if (playCount > 10000000) score += PLAY_BONUS_10M;
      else if (playCount > 1000000) score += PLAY_BONUS_1M;

      // Seed artist bonus
      const artistName = (song.artist || '').toLowerCase();
      if (seedSet.size > 0 && [...seedSet].some(s => artistName.includes(s))) {
        score += SEED_BONUS;
      }

      // Keep the highest-scoring version of each song
      const existing = seen.get(sid);
      if (!existing || score > existing.score) {
        seen.set(sid, { song, score });
      }
    }
  }

  collect(playlistSongs, SOURCE_WEIGHT.playlist);
  collect(artistSongs, SOURCE_WEIGHT.artist);
  collect(songSearch, SOURCE_WEIGHT.search);

  if (seen.size === 0) return [];

  // Sort by score descending, then by playCount as tiebreaker
  const ranked = [...seen.values()]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.song.playCount || 0) - (a.song.playCount || 0);
    })
    .map(entry => entry.song);

  return ranked.slice(0, limit);
}

/**
 * Create a GenreSearchEngine bound to a MusicSourcePort.
 *
 * @param {object} musicPort — must implement:
 *   search(query, limit) → Song[]
 *   searchPlaylists(query, limit) → Playlist[]
 *   getPlaylistTracks(playlistId) → Song[]
 *   searchArtists(query, limit) → Artist[]
 *   artistHotSongs(artistId) → Song[]
 * @returns {{ search: (genreText: string, options?: object) => Promise<Song[]> }}
 */
export function createGenreSearchEngine(musicPort) {
  /**
   * Search for songs matching a genre keyword.
   * @param {string} genreText — user-provided genre text (e.g. "jpop", "来点爵士")
   * @param {object} [options]
   * @param {number} [options.limit=15] — max songs to return
   * @returns {Promise<Array>} ranked songs
   */
  async function search(genreText, options = {}) {
    const limit = options.limit || DEFAULT_LIMIT;
    const match = matchGenre(genreText);
    if (!match) return [];

    const { entry } = match;

    // Run all three stages in parallel
    const [playlistResult, artistResult, songResult] = await Promise.allSettled([
      _searchPlaylists(entry),
      _searchArtists(entry, genreText),
      _searchSongs(entry),
    ]);

    const playlistSongs = playlistResult.status === 'fulfilled' ? playlistResult.value : [];
    const artistSongs = artistResult.status === 'fulfilled' ? artistResult.value : [];
    const songSearch = songResult.status === 'fulfilled' ? songResult.value : [];

    return mergeAndRank({
      playlistSongs,
      artistSongs,
      songSearch,
      seedArtists: entry.seedArtists,
      limit,
    });
  }

  /** Stage 1: Search playlists by genre → get tracks from top playlists */
  async function _searchPlaylists(entry) {
    if (!musicPort.searchPlaylists || !musicPort.getPlaylistTracks) return [];

    const playlists = await musicPort.searchPlaylists(entry.playlistQuery, DEFAULT_PLAYLIST_SEARCH_LIMIT);
    if (!playlists || playlists.length === 0) return [];

    // Sort by playCount descending, take top N
    const topPlaylists = playlists
      .filter(p => p && p.id)
      .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
      .slice(0, DEFAULT_PLAYLIST_SEARCH_LIMIT);

    // Fetch tracks from each playlist in parallel
    const trackResults = await Promise.allSettled(
      topPlaylists.map(pl => musicPort.getPlaylistTracks(pl.id)),
    );

    const songs = [];
    for (const result of trackResults) {
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        songs.push(...result.value.slice(0, DEFAULT_PLAYLIST_TRACK_LIMIT));
      }
    }
    return songs;
  }

  /** Stage 2: Search artists by genre keyword + fetch hot songs from seed artists */
  async function _searchArtists(entry, genreText) {
    const songs = [];

    // 2a: Search artists by genre keyword
    if (musicPort.searchArtists && musicPort.artistHotSongs) {
      try {
        const artists = await musicPort.searchArtists(genreText, DEFAULT_ARTIST_SEARCH_LIMIT);
        if (artists && artists.length > 0) {
          const topArtists = artists
            .filter(a => a && a.id)
            .sort((a, b) => (b.songCount || 0) - (a.songCount || 0))
            .slice(0, DEFAULT_ARTIST_SEARCH_LIMIT);

          const hotResults = await Promise.allSettled(
            topArtists.map(a => musicPort.artistHotSongs(a.id)),
          );
          for (const result of hotResults) {
            if (result.status === 'fulfilled' && Array.isArray(result.value)) {
              songs.push(...result.value.slice(0, DEFAULT_ARTIST_SONG_LIMIT));
            }
          }
        }
      } catch { /* ignore */ }
    }

    // 2b: Also directly search songs from seed artists
    if (musicPort.search && entry.seedArtists) {
      const seedResults = await Promise.allSettled(
        entry.seedArtists.slice(0, 3).map(artist =>
          musicPort.search(artist, DEFAULT_SEED_ARTIST_SEARCH_LIMIT),
        ),
      );
      for (const result of seedResults) {
        if (result.status === 'fulfilled' && Array.isArray(result.value)) {
          songs.push(...result.value);
        }
      }
    }

    return songs;
  }

  /** Stage 3: Fallback song search with enhanced query */
  async function _searchSongs(entry) {
    if (!musicPort.search) return [];
    return musicPort.search(entry.enhancedQuery, DEFAULT_SONG_SEARCH_LIMIT);
  }

  return { search };
}
