import {
  getSeedPool,
  upsertSeedPool,
  incrementPlayCount,
} from '../../../db/history.js';

function parseGenreTags(raw) {
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function toSeedSong(row) {
  return {
    songId: String(firstValue(row.song_id, row.songId, '')),
    title: row.title || '',
    artist: row.artist || '',
    album: row.album || '',
    durationMs: firstValue(row.duration, row.durationMs, 0),
    source: row.source || '',
    genreTags: parseGenreTags(firstValue(row.genre_tags, row.genreTags)),
    playCount: firstValue(row.play_count, row.playCount, 0),
  };
}

function toLegacySeedSong(song) {
  return {
    song_id: song.songId,
    title: song.title,
    artist: song.artist,
    album: song.album,
    duration: song.durationMs,
    source: song.source,
    genre_tags: JSON.stringify(song.genreTags || []),
  };
}

/**
 * Wraps legacy seed_pool helpers behind SeedPoolRepository.
 *
 * @param {object=} legacy
 */
export function createLegacySeedPoolRepository(legacy = {
  getSeedPool,
  upsertSeedPool,
  incrementPlayCount,
}) {
  return {
    upsert(song) {
      legacy.upsertSeedPool(toLegacySeedSong(song));
    },
    incrementPlayCount(songId) {
      legacy.incrementPlayCount(songId);
    },
    all(limit) {
      return (legacy.getSeedPool(limit) || []).map(toSeedSong);
    },
  };
}

export const legacySeedPoolRepository = createLegacySeedPoolRepository();
