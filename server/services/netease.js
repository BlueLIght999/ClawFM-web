/**
 * Netease Cloud Music API proxy
 * Calls NeteaseCloudMusicApi server on localhost:3000 (HTTP)
 */
import { getStoredCookie, saveCookie } from '../utils/cookie-store.js';

const API_BASE = 'http://localhost:3000';

let cachedCookie = '';

export function getCookie() { return cachedCookie || getStoredCookie(); }
export function setCookie(c) { cachedCookie = c; saveCookie(c); }

async function callApi(endpoint, params = {}) {
  const url = new URL(`${API_BASE}${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }

  const cookie = getCookie();
  const headers = {};
  if (cookie) headers['Cookie'] = cookie;

  try {
    const res = await fetch(url.toString(), { headers });
    const body = await res.json();

    // Handle cookie refresh
    if (body.cookie) {
      cachedCookie = body.cookie;
      saveCookie(body.cookie, { userId: String(body.account?.id || body.profile?.userId || '') });
    }

    if (body.code === 301 || body.body?.code === 301) {
      console.log('[Netease] Cookie expired, trying status check...');
      // Try /login/status which triggers refresh internally
      const refreshRes = await fetch(`${API_BASE}/login/refresh`, { headers });
      const refreshBody = await refreshRes.json();
      if (refreshBody.cookie) {
        cachedCookie = refreshBody.cookie;
        saveCookie(refreshBody.cookie);
        // Retry original request
        const retryHeaders = { 'Cookie': cachedCookie };
        const retryRes = await fetch(url.toString(), { headers: retryHeaders });
        return retryRes.json();
      }
      throw new Error('Login expired — please re-login');
    }

    return body;
  } catch (e) {
    console.error(`[Netease] API call failed: ${endpoint} —`, e.message);
    throw e;
  }
}

// === Auth ===
export async function phoneLogin(phone, password) {
  const result = await callApi('/login/cellphone', { phone, password, countrycode: '86' });
  if (result.cookie) {
    cachedCookie = result.cookie;
    saveCookie(result.cookie, {
      userId: String(result.account?.id || result.profile?.userId || ''),
      nickname: result.profile?.nickname || '',
      avatarUrl: result.profile?.avatarUrl || '',
    });
  }
  return result;
}

export async function createQrLogin() {
  const keyRes = await callApi('/login/qr/key');
  const key = keyRes.data?.unikey || keyRes.body?.data?.unikey;
  if (!key) throw new Error('Failed to get QR key');
  const qrRes = await callApi('/login/qr/create', { key, qrimg: true });
  return { unikey: key, ...qrRes.data, ...qrRes.body?.data };
}

export async function checkQrLogin(key) {
  return callApi('/login/qr/check', { key });
}

export async function checkLoginStatus() {
  const res = await callApi('/login/status');
  // Normalize: API nests under .data
  const data = res.data || res;
  return {
    profile: data.profile || null,
    account: data.account || null,
    code: data.code || res.code || 200,
  };
}

// === User data ===
export async function getUserPlaylists(uid) {
  const res = await callApi('/user/playlist', { uid });
  return { playlist: res.playlist || res.body?.playlist || [] };
}

export async function getPlaylistTracks(id) {
  const res = await callApi('/playlist/track/all', { id });
  return res;
}

export async function getSongUrl(id) {
  const levels = ['exhigh', 'lossless', 'hires', 'standard'];
  for (const level of levels) {
    const res = await callApi('/song/url/v1', { id, level });
    const data = res.data || res.body?.data || [];
    if (data.length > 0 && data[0].url) return { data };
  }
  // Final fallback
  return callApi('/song/url/v1', { id, level: 'standard' });
}

export async function getSongDetail(ids) {
  return callApi('/song/detail', { ids: Array.isArray(ids) ? ids.join(',') : ids });
}

export async function getPersonalFm() {
  return callApi('/personal_fm');
}

export async function getRecommendSongs() {
  return callApi('/recommend/songs');
}

export async function getLikedSongs(uid) {
  return callApi('/likelist', { uid });
}

export async function searchSongs(keywords, limit = 20) {
  return callApi('/cloudsearch', { keywords, limit, type: 1 });
}

export async function getSimilarSongs(id) {
  const res = await callApi('/simi/song', { id });
  return { songs: res.songs || res.body?.songs || [] };
}

export async function getUserDetail(uid) {
  return callApi('/user/detail', { uid });
}

export async function scrobbleSong(id, sourceId = 0, time = 0) {
  return callApi('/scrobble', { id, sourceid: sourceId, time }).catch(() => {});
}

export async function getSmartPlaylist({ songId, playlistId }) {
  return callApi('/playmode/song/vector', { songId, pid: playlistId });
}

export async function getUserRecord(uid, type = 0) {
  return callApi('/record/recent', { uid, type });
}

export async function getSimilarPlaylists(id) {
  return callApi('/simi/playlist', { id });
}

// === Lyrics ===
export async function getLyric(id) {
  return callApi('/lyric', { id });
}
