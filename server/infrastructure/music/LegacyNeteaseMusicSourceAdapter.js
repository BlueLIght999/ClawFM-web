import {
  searchSongs,
  searchPlaylists as neteaseSearchPlaylists,
  searchArtists as neteaseSearchArtists,
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
  getArtistDetail,
  getArtistDesc,
  getArtistSongs,
  getStyleList,
  getStyleSongs,
  getStyleArtists,
  getSongWikiSummary,
  getSongCreators,
  getSimilarArtists,
  getPlaymodeIntelligenceList,
  getRecommendResource,
  getPersonalized,
  getSearchSuggest,
  getSearchHotDetail,
  getPlaylistCatlist,
  getPlaylistHot,
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
 * Map raw Netease playlist to clean DTO (D6 compliance).
 * @param {object} raw — raw Netease playlist object
 * @returns {{id: string, name: string, trackCount: number, playCount: number, creator: string, coverUrl: string}}
 */
function toPlaylistDTO(raw) {
  if (!raw || !raw.id) return null;
  return {
    id: String(raw.id),
    name: raw.name || '',
    trackCount: raw.trackCount || 0,
    playCount: raw.playCount || raw.playcount || 0,
    creator: raw.creator?.nickname || '',
    coverUrl: raw.coverImgUrl || raw.picUrl || '',
  };
}

function toPlaylists(rawPlaylists) {
  return (rawPlaylists || []).map(toPlaylistDTO).filter(Boolean);
}

/**
 * Build the core music source methods (playback + playlist).
 */
function buildCoreMethods(legacy) {
  return {
    async search(keywords, limit = 20) {
      const result = await legacy.searchSongs(keywords, limit);
      return toSongs(songsFromSearchResult(result));
    },
    /** Search playlists by keywords (type=1000). Returns Playlist DTOs. */
    async searchPlaylists(keywords, limit = 10) {
      const result = await legacy.searchPlaylists(keywords, limit);
      const rawPlaylists = result?.result?.playlists || result?.playlists || [];
      return toPlaylists(rawPlaylists);
    },
    /** Search artists by keywords (type=100). Returns Artist DTOs. */
    async searchArtists(keywords, limit = 10) {
      const result = await legacy.searchArtists(keywords, limit);
      const rawArtists = result?.result?.artists || result?.artists || [];
      return (rawArtists || []).map(a => a && a.id ? {
        id: String(a.id),
        name: a.name || '',
        songCount: a.musicSize || a.songSize || 0,
        picUrl: a.picUrl || a.img1v1Url || '',
      } : null).filter(Boolean);
    },
    /** Get all tracks from a playlist, returned as Song DTOs. */
    async getPlaylistTracks(playlistId) {
      const result = await legacy.getPlaylistTracks(playlistId);
      return toSongs(songsFromPlaylistResult(result));
    },
    /** Get hot songs for an artist. */
    async artistHotSongs(artistId, limit = 5) {
      const result = await legacy.getArtistSongs(artistId, { limit, order: 'hot' });
      const rawSongs = result?.songs || result?.hotSongs || [];
      return toSongs(rawSongs);
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
      const ids = result?.ids || result?.songs || [];

      // P0: Real /likelist API returns numeric ID array, not song objects.
      // Detect shape: if first element is a number, fetch full song details.
      if (Array.isArray(ids) && ids.length > 0 && typeof ids[0] === 'number') {
        const batchIds = ids.slice(0, 500).join(',');
        const detail = await legacy.getSongDetail(batchIds);
        return toSongs(detail?.songs || []);
      }

      // Backward compat: ids is already an object array (old test mocks)
      return toSongs(ids);
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
      return toPlaylists(result?.playlist || []);
    },
    async playlistTracks(playlistId) {
      const result = await legacy.getPlaylistTracks(playlistId);
      return toSongs(songsFromPlaylistResult(result));
    },
    async scrobble(songId) {
      try {
        await legacy.scrobbleSong(songId);
      } catch (e) {
        // Scrobble failure should never interrupt playback.
        console.warn('[NeteaseAdapter] Scrobble failed (degraded):', e.message);
      }
    },
  };
}

/**
 * Build the profile-system extension methods (metadata + discovery).
 */
function buildProfileMethods(legacy) {
  return {
    async artistDetail(artistId) {
      const result = await legacy.getArtistDetail(artistId);
      return result?.data || result?.artist || null;
    },
    async artistDesc(artistId) {
      const result = await legacy.getArtistDesc(artistId);
      return result?.briefDesc || result?.data?.briefDesc || '';
    },
    async songWiki(songId) {
      const result = await legacy.getSongWikiSummary(songId);
      return result?.data || result || null;
    },
    async songCreators(songId) {
      const result = await legacy.getSongCreators(songId);
      return result?.data || result || null;
    },
    async similarArtists(artistId) {
      const result = await legacy.getSimilarArtists(artistId);
      return result?.artists || result?.data?.artists || [];
    },
    async styleList() {
      const result = await legacy.getStyleList();
      return result?.data || result?.tags || [];
    },
    async styleSongs(styleId, opts) {
      const result = await legacy.getStyleSongs(styleId, opts);
      return toSongs(result?.songs || result?.data?.songs || []);
    },
    async styleArtists(styleId, opts) {
      const result = await legacy.getStyleArtists(styleId, opts);
      return result?.artists || result?.data?.artists || [];
    },
    async recommendResource() {
      const result = await legacy.getRecommendResource();
      return result?.recommend || result?.data || [];
    },
    async personalized(opts) {
      const result = await legacy.getPersonalized(opts);
      return result?.result || result?.data || [];
    },
    async searchSuggest(keywords) {
      const result = await legacy.getSearchSuggest(keywords);
      return result?.result || result?.data || [];
    },
    async searchHotDetail() {
      const result = await legacy.getSearchHotDetail();
      return result?.data || result?.hots || [];
    },
    async playlistCatlist() {
      const result = await legacy.getPlaylistCatlist();
      return result?.sub || result?.categories || {};
    },
    async playlistHot() {
      const result = await legacy.getPlaylistHot();
      return result?.tags || result?.data || [];
    },
    async playmodeIntelligence({ songId, playlistId, startSongId, count }) {
      const result = await legacy.getPlaymodeIntelligenceList({ songId, playlistId, startSongId, count });
      return result?.data || result?.body?.data || [];
    },
  };
}

/**
 * Wraps the legacy NetEase module behind MusicSourcePort.
 *
 * @param {object=} legacy
 */
export function createLegacyNeteaseMusicSourceAdapter(legacy = {
  searchSongs,
  searchPlaylists: neteaseSearchPlaylists,
  searchArtists: neteaseSearchArtists,
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
  getArtistDetail,
  getArtistDesc,
  getArtistSongs,
  getStyleList,
  getStyleSongs,
  getStyleArtists,
  getSongWikiSummary,
  getSongCreators,
  getSimilarArtists,
  getPlaymodeIntelligenceList,
  getRecommendResource,
  getPersonalized,
  getSearchSuggest,
  getSearchHotDetail,
  getPlaylistCatlist,
  getPlaylistHot,
}) {
  return { ...buildCoreMethods(legacy), ...buildProfileMethods(legacy) };
}

export const legacyNeteaseMusicSourceAdapter = createLegacyNeteaseMusicSourceAdapter();

function extractLyricField(result, field) {
  const top = (result && result[field]) || {};
  const nested = (result && result.data && result.data[field]) || {};
  return top.lyric || nested.lyric || '';
}
