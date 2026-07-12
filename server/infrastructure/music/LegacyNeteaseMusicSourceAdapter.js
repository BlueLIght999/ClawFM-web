import {
  searchSongs,
  getSongUrl,
  getLyric,
  getSimilarSongs,
  getPersonalFm,
  getRecommendSongs,
  getSongDetail,
  getLikedSongs,
  getUserPlaylists,
  getPlaylistTracks,
  scrobbleSong,
} from '../netease/neteaseApi.js';
import { toSongDTO } from '../../domain/curation/toSongDTO.js';

function songsFromSearchResult(result) {
  return result?.result?.songs || result?.songs || result?.body?.songs || [];
}

function songsFromPlaylistResult(result) {
  return result?.songs || result?.playlist?.tracks || result?.body?.songs || [];
}

function toSongs(rawSongs) {
  return (rawSongs || []).map(toSongDTO).filter(Boolean);
}

/**
 * Wraps the legacy NetEase module behind MusicSourcePort.
 *
 * @param {object=} legacy
 */
export function createLegacyNeteaseMusicSourceAdapter(legacy = {
  searchSongs,
  getSongUrl,
  getLyric,
  getSimilarSongs,
  getPersonalFm,
  getRecommendSongs,
  getSongDetail,
  getLikedSongs,
  getUserPlaylists,
  getPlaylistTracks,
  scrobbleSong,
}) {
  return {
    async search(keywords, limit = 20) {
      const result = await legacy.searchSongs(keywords, limit);
      return toSongs(songsFromSearchResult(result));
    },
    async songUrl(songId) {
      const result = await legacy.getSongUrl(songId);
      return result?.data?.[0]?.url || null;
    },
    async lyric(songId) {
      const result = await legacy.getLyric(songId);
      const lrc = extractLyricField(result, 'lrc');
      const tlrc = extractLyricField(result, 'tlyric');
      return lrc || tlrc ? { lrc, tlrc } : null;
    },
    async similar(songId) {
      const result = await legacy.getSimilarSongs(songId);
      return toSongs(result?.songs || []);
    },
    async details(songIds) {
      const result = await legacy.getSongDetail(songIds);
      return toSongs(result?.songs || []);
    },
    async likedSongs(uid) {
      const result = await legacy.getLikedSongs(uid);
      return toSongs(result?.ids || result?.songs || []);
    },
    async personalFm() {
      const result = await legacy.getPersonalFm();
      return toSongs(result?.data || []);
    },
    async dailyRecommend() {
      const result = await legacy.getRecommendSongs();
      return toSongs(result?.data?.dailySongs || result?.recommend || []);
    },
    async userPlaylists(uid) {
      const result = await legacy.getUserPlaylists(uid);
      return result?.playlist || [];
    },
    async playlistTracks(playlistId) {
      const result = await legacy.getPlaylistTracks(playlistId);
      return toSongs(songsFromPlaylistResult(result));
    },
    async scrobble(songId) {
      try {
        await legacy.scrobbleSong(songId);
      } catch {
        // Scrobble failure should never interrupt playback.
      }
    },
  };
}

export const legacyNeteaseMusicSourceAdapter = createLegacyNeteaseMusicSourceAdapter();

function extractLyricField(result, field) {
  const top = (result && result[field]) || {};
  const nested = (result && result.data && result.data[field]) || {};
  return top.lyric || nested.lyric || '';
}
