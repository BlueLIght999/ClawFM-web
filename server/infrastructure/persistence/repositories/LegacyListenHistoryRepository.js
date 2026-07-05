import {
  recordListen,
  getRecentSongIds,
  getArtistPlayCount,
  getListenHistory,
} from '../../../db/history.js';

function toLegacyPlayRecord(play) {
  return {
    song_id: play.songId,
    title: play.title,
    artist: play.artist,
    album: play.album,
    duration: play.durationSec,
    source: play.source,
  };
}

function toPlayRecord(row) {
  return {
    songId: String(row.song_id ?? row.songId ?? ''),
    title: row.title || '',
    artist: row.artist || '',
    album: row.album || '',
    durationSec: row.duration ?? row.durationSec ?? 0,
    source: row.source || '',
    playedAt: row.played_at ?? row.playedAt,
  };
}

/**
 * Wraps legacy db/history listen-history functions behind ListenHistoryRepository.
 *
 * @param {object=} legacy
 */
export function createLegacyListenHistoryRepository(legacy = {
  recordListen,
  getRecentSongIds,
  getArtistPlayCount,
  getListenHistory,
}) {
  return {
    record(play) {
      legacy.recordListen(toLegacyPlayRecord(play));
    },
    recentSongIds(limit) {
      return legacy.getRecentSongIds(limit) || [];
    },
    artistPlayCount(hours) {
      return legacy.getArtistPlayCount(hours) || [];
    },
    history(limit) {
      return (legacy.getListenHistory(limit) || []).map(toPlayRecord);
    },
  };
}

export const legacyListenHistoryRepository = createLegacyListenHistoryRepository();
