/**
 * GenreSearchEngine - three-stage parallel genre search with fusion ranking.
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

// Source weights - playlist tracks are curated, artist songs are representative,
// song search is a catch-all.
const SOURCE_WEIGHT = {
  playlist: 0.9,
  artist: 0.8,
  search: 0.5,
};

// Play count bonus thresholds
const PLAY_BONUS_1M = 0.1;    // playCount > 1,000,000
const PLAY_BONUS_10M = 0.15;  // playCount > 10,000,000

// Seed artist bonus - song's artist matches a seed artist in genreDict
const SEED_BONUS = 0.2;

// Play count thresholds, named so the two bonuses read as the rule they encode
// rather than as bare digit strings.
const PLAY_COUNT_1M = 1000000;
const PLAY_COUNT_10M = 10000000;

// Defaults
const DEFAULT_LIMIT = 15;
const DEFAULT_PLAYLIST_SEARCH_LIMIT = 2;     // top 2 playlists
const DEFAULT_PLAYLIST_TRACK_LIMIT = 10;     // 10 tracks per playlist
const DEFAULT_ARTIST_SEARCH_LIMIT = 2;       // top 2 artists from keyword search
const DEFAULT_ARTIST_SONG_LIMIT = 5;         // 5 hot songs per artist
const DEFAULT_SONG_SEARCH_LIMIT = 10;        // 10 songs from enhanced query
const DEFAULT_SEED_ARTIST_SEARCH_LIMIT = 3;  // 3 songs per seed artist

/**
 * Score one song against its source weight, play count and the seed-artist set.
 * Extracted from the merge loop so the branch chain that builds the score sits in
 * one place and the loop reads as "score, then keep the best".
 *
 * @param {object} song
 * @param {number} sourceWeight
 * @param {Set<string>} seedSet lowercased seed artist names
 * @returns {number}
 */
function scoreSong(song, sourceWeight, seedSet) {
  let score = sourceWeight;

  const playCount = song.playCount || 0;
  if (playCount > PLAY_COUNT_10M) score += PLAY_BONUS_10M;
  else if (playCount > PLAY_COUNT_1M) score += PLAY_BONUS_1M;

  if (seedSet.size > 0 && songMatchesSeed(song, seedSet)) score += SEED_BONUS;

  return score;
}

/**
 * Does the song's artist name contain any seed artist? Substring, not equality:
 * the port reports display names ("周杰伦 (Jay Chou)") that carry the seed name
 * inside them, so a strict compare would drop most seed matches.
 *
 * @param {object} song
 * @param {Set<string>} seedSet lowercased seed artist names
 * @returns {boolean}
 */
function songMatchesSeed(song, seedSet) {
  const artistName = (song.artist || '').toLowerCase();
  if (!artistName) return false;
  for (const seed of seedSet) {
    if (artistName.includes(seed)) return true;
  }
  return false;
}

/**
 * Merge and rank songs from three sources.
 * @param {object} params
 * All inputs are optional because the bag defaults to `{}` -- each has an inline
 * default below, so a required tag rejects the empty default (TS2739).
 *
 * @param {Array} [params.playlistSongs] - songs from playlist tracks
 * @param {Array} [params.artistSongs] - songs from artist hot songs
 * @param {Array} [params.songSearch] - songs from enhanced song search
 * @param {string[]} [params.seedArtists] - genre's representative artists
 * @param {number} [params.limit=15] - max results
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
      const score = scoreSong(song, sourceWeight, seedSet);

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
 * Flatten a Promise.allSettled result set into one song array.
 *
 * Every stage of this engine fans out over several port calls and keeps whatever
 * came back, so they all shared the same `status === 'fulfilled' && Array.isArray`
 * loop verbatim (CODING-STYLE no-duplication > 3). Extracting it also means a
 * rejected call cannot silently contribute a non-array: the check lives once.
 *
 * @param {Array<PromiseSettledResult<Array>>} settled
 * @param {number} [perResultLimit] - cap tracks taken from each result, if any
 * @returns {Array} concatenated songs
 */
function flattenSettledSongs(settled, perResultLimit) {
  const songs = [];
  for (const result of settled) {
    if (result.status !== 'fulfilled' || !Array.isArray(result.value)) continue;
    const value = perResultLimit ? result.value.slice(0, perResultLimit) : result.value;
    songs.push(...value);
  }
  return songs;
}

/**
 * The songs from a single settled stage result, or [] if it rejected. The three
 * parallel stages in search() are best-effort, so a failure degrades to "this
 * stage found nothing" rather than failing the whole query.
 *
 * @param {PromiseSettledResult<Array>} result
 * @returns {Array}
 */
function settledSongs(result) {
  return result.status === 'fulfilled' && Array.isArray(result.value) ? result.value : [];
}

/**
 * Create a GenreSearchEngine bound to a MusicSourcePort.
 *
 * @param {object} musicPort - must implement:
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
   * @param {string} genreText - user-provided genre text (e.g. "jpop", "来点爵士")
   * @param {object} [options]
   * @param {number} [options.limit=15] - max songs to return
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

    return mergeAndRank({
      playlistSongs: settledSongs(playlistResult),
      artistSongs: settledSongs(artistResult),
      songSearch: settledSongs(songResult),
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
    return flattenSettledSongs(trackResults, DEFAULT_PLAYLIST_TRACK_LIMIT);
  }

  /** Stage 2: Search artists by genre keyword + fetch hot songs from seed artists */
  async function _searchArtists(entry, genreText) {
    // The two sources below are independent and both optional; each is one call
    // here so the stage reads as its two documented halves (2a / 2b).
    const byKeyword = await _songsFromGenreArtists(genreText);
    const bySeed = await _songsFromSeedArtists(entry);
    return [...byKeyword, ...bySeed];
  }

  /**
   * 2a: find artists by genre keyword, then pull each one's hot songs. Returns []
   * when the port lacks either capability or the search fails -- this stage is
   * best-effort and the next stage covers the shortfall.
   * @param {string} genreText
   * @returns {Promise<Array>}
   */
  async function _songsFromGenreArtists(genreText) {
    if (!musicPort.searchArtists || !musicPort.artistHotSongs) return [];
    try {
      const artists = await musicPort.searchArtists(genreText, DEFAULT_ARTIST_SEARCH_LIMIT);
      if (!artists || artists.length === 0) return [];
      const topArtists = artists
        .filter(a => a && a.id)
        .sort((a, b) => (b.songCount || 0) - (a.songCount || 0))
        .slice(0, DEFAULT_ARTIST_SEARCH_LIMIT);

      const hotResults = await Promise.allSettled(
        topArtists.map(a => musicPort.artistHotSongs(a.id)),
      );
      return flattenSettledSongs(hotResults, DEFAULT_ARTIST_SONG_LIMIT);
    } catch { return []; /* ignore -- the song-search stage covers the shortfall */ }
  }

  /**
   * 2b: directly search songs by each seed artist's name.
   * @param {{seedArtists?: string[]}} entry
   * @returns {Promise<Array>}
   */
  async function _songsFromSeedArtists(entry) {
    if (!musicPort.search || !entry.seedArtists) return [];
    const seedResults = await Promise.allSettled(
      entry.seedArtists.slice(0, 3).map(artist =>
        musicPort.search(artist, DEFAULT_SEED_ARTIST_SEARCH_LIMIT),
      ),
    );
    return flattenSettledSongs(seedResults);
  }

  /** Stage 3: Fallback song search with enhanced query */
  async function _searchSongs(entry) {
    if (!musicPort.search) return [];
    const songs = await musicPort.search(entry.enhancedQuery, DEFAULT_SONG_SEARCH_LIMIT);
    return Array.isArray(songs) ? songs : [];
  }

  return { search };
}
