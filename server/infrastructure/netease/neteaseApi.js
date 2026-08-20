/**
 * Netease Cloud Music API proxy
 * Calls NeteaseCloudMusicApi server on localhost:4001 (HTTP, configurable via NETEASE_API_PORT)
 */
import { legacyAuthRepository } from '../persistence/repositories/LegacyAuthRepository.js';
import config from '../../config.js';

const API_BASE = `http://localhost:${config.netease.apiPort}`;

let cachedCookie = '';

let authRepository = legacyAuthRepository;

export function setAuthRepository(repository) {
  authRepository = repository || legacyAuthRepository;
  cachedCookie = '';
}

export function getCookie() { return cachedCookie || authRepository.currentCookie(); }
export function setCookie(c) { cachedCookie = c; authRepository.saveSession(c); }

const FETCH_TIMEOUT_MS = 10000;

/**
 * Fetch wrapper with AbortController timeout.
 * Prevents indefinite hangs when NeteaseAPI subprocess is unresponsive.
 */
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callApi(endpoint, params = {}) {
  const url = buildApiUrl(endpoint, params);
  const headers = buildAuthHeaders();
  try {
    const res = await fetchWithTimeout(url.toString(), { headers });
    if (!res.ok) {
      throw new Error(`NeteaseAPI HTTP ${res.status} ${res.statusText} — endpoint: ${endpoint}`);
    }
    const body = await parseJsonResponse(res);
    updateCookieFromBody(body);
    if (isLoginExpired(body)) {
      return await refreshAndRetry(url, headers);
    }
    return body;
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error(`NeteaseAPI request timed out after ${FETCH_TIMEOUT_MS}ms: ${endpoint}`, { cause: e });
    }
    // EH2: wrap raw fetch/JSON errors instead of bare rethrow
    console.error(`[Netease] API call failed: ${endpoint} —`, e.message);
    throw new Error(`NeteaseAPI call failed (${endpoint}): ${e.message}`, { cause: e });
  }
}

function buildApiUrl(endpoint, params) {
  const url = new URL(`${API_BASE}${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }
  return url;
}

function buildAuthHeaders() {
  const cookie = getCookie();
  const headers = {};
  if (cookie) headers['Cookie'] = cookie;
  return headers;
}

// set-cookie 属性名，清洗时丢弃（login_qr_check 的 cookie.join(';') 会带入这些）
const COOKIE_ATTR_NAMES = new Set([
  'max-age', 'expires', 'path', 'domain', 'samesite', 'secure', 'httponly', '',
]);

/**
 * 清洗 cookie 字符串：只保留键值对，去掉 set-cookie 属性（Max-Age/Expires/Path 等）。
 * NeteaseCloudMusicApi 的 login_qr_check 把完整 set-cookie join 进 body.cookie，
 * 污染的 cookie 会导致 /login/status 解析失败返回 profile:null。
 */
function sanitizeCookie(raw) {
  if (!raw) return '';
  if (Array.isArray(raw)) raw = raw.join('; ');
  return raw
    .split(';')
    .map(s => s.trim())
    .filter(pair => {
      // 取 '=' 前的标识符（无 '=' 的裸 token 用其本身）判断是否为 set-cookie 属性名。
      // 这样既能过滤 'Max-Age=0' 也能过滤无值的 'HttpOnly'，同时保留真实键值对与裸 token。
      const eq = pair.indexOf('=');
      const name = eq < 0 ? pair : pair.slice(0, eq);
      return !COOKIE_ATTR_NAMES.has(name.trim().toLowerCase());
    })
    .join('; ');
}

function updateCookieFromBody(body) {
  if (!body.cookie) return;
  const cleaned = sanitizeCookie(body.cookie);
  if (!cleaned) return;
  cachedCookie = cleaned;
  // /login/status 等接口把 account/profile 嵌套在 data 下，需兼容两种层级
  const account = body.account || body.data?.account;
  const profile = body.profile || body.data?.profile;
  const uid = String(account?.id || profile?.userId || profile?.accountId || '');
  // 仅在 uid 有值时落库 user_id，避免后续 API 调用（/song/detail 等）
  // 的响应不含 account/profile 时把已有 user_id 覆盖为空
  if (uid) {
    authRepository.saveSession(cleaned, { userId: uid, nickname: profile?.nickname || '', avatarUrl: profile?.avatarUrl || '' });
  } else {
    // uid 不可用时只更新 cookie，不覆盖 user_id
    authRepository.saveSession(cleaned, {});
  }
}

async function parseJsonResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    throw new Error(
      `NeteaseCloudMusicApi returned non-JSON response (${contentType}) — ` +
      `check if port ${config.netease.apiPort} is occupied by another application. ` +
      `Response preview: ${text.slice(0, 100)}`
    );
  }
  return res.json();
}

function isLoginExpired(body) {
  return body.code === 301 || body.body?.code === 301;
}

async function refreshAndRetry(url, headers) {
  console.log('[Netease] Cookie expired, trying refresh...');
  const refreshRes = await fetchWithTimeout(`${API_BASE}/login/refresh`, { headers });
  if (!refreshRes.ok) {
    throw new Error(`NeteaseAPI refresh HTTP ${refreshRes.status}`);
  }
  const refreshBody = await refreshRes.json();
  if (!refreshBody.cookie) {
    throw new Error('Login expired — please re-login');
  }
  cachedCookie = refreshBody.cookie;
  authRepository.saveSession(refreshBody.cookie);
  const retryRes = await fetchWithTimeout(url.toString(), { headers: { 'Cookie': cachedCookie } });
  if (!retryRes.ok) {
    throw new Error(`NeteaseAPI retry HTTP ${retryRes.status}`);
  }
  const retryBody = await retryRes.json();
  if (isLoginExpired(retryBody)) {
    throw new Error('Login expired — please re-login');
  }
  return retryBody;
}

// === Auth ===
export async function phoneLogin(phone, password) {
  const result = await callApi('/login/cellphone', { phone, password, countrycode: '86' });
  if (result.cookie) {
    cachedCookie = result.cookie;
    authRepository.saveSession(result.cookie, {
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
  const profile = data.profile || null;
  const account = data.account || null;
  // /login/status 响应不含 cookie 字段，updateCookieFromBody 不会触发；
  // 但 uid/nickname 必须落库（社区鉴权依赖 netease_auth.user_id），用现有 cookie 主动写一次。
  // 仅在非匿名用户时落库，避免把匿名 account.id 写成登录 uid。
  const isAnonymous = account?.anonimousUser === true;
  if (!isAnonymous) {
    const uid = String(account?.id || profile?.userId || profile?.accountId || '');
    if (uid) {
      authRepository.saveSession(getCookie(), { userId: uid, nickname: profile?.nickname || '', avatarUrl: profile?.avatarUrl || '' });
    }
  }
  return {
    profile,
    account,
    code: data.code || res.code || 200,
  };
}

// === User data ===
export async function getUserPlaylists(uid) {
  const res = await callApi('/user/playlist', { uid });
  return { playlist: res.playlist || res.body?.playlist || [] };
}

export async function getPlaylistTracks(id) {
  // 用 /playlist/detail 替代 /playlist/track/all：
  // detail 官方最多返回 1000 首、响应体更轻、聚合更快，显著降低 GET 超时（track/all 全量返回大歌单易卡 10s 超时）。
  // 返回的 playlist.tracks 解析由 songsFromPlaylistResult 兼容。
  const res = await callApi('/playlist/detail', { id });
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

/** Search playlists by keywords (type=1000). Returns raw NetEase response. */
export async function searchPlaylists(keywords, limit = 10) {
  return callApi('/cloudsearch', { keywords, limit, type: 1000 });
}

/** Search artists by keywords (type=100). Returns raw NetEase response. */
export async function searchArtists(keywords, limit = 10) {
  return callApi('/cloudsearch', { keywords, limit, type: 100 });
}

export async function getSimilarSongs(id) {
  const res = await callApi('/simi/song', { id });
  return { songs: res.songs || res.body?.songs || [] };
}

export async function getUserDetail(uid) {
  return callApi('/user/detail', { uid });
}

export async function scrobbleSong(id, sourceId = 0, time = 0) {
  return callApi('/scrobble', { id, sourceid: sourceId, time }).catch(e => console.warn('[NeteaseAPI] Scrobble failed (degraded):', e.message));
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

// === Profile System APIs ===

export async function getArtistDetail(id) {
  return callApi('/artist/detail', { id });
}

export async function getArtistDesc(id) {
  return callApi('/artist/desc', { id });
}

export async function getArtistSongs(id, { limit = 50, offset = 0, order = 'hot' } = {}) {
  return callApi('/artist/songs', { id, limit, offset, order });
}

export async function getStyleList() {
  return callApi('/style/list');
}

export async function getStyleSongs(styleId, { limit = 50, offset = 0 } = {}) {
  return callApi('/style/song', { id: styleId, limit, offset });
}

export async function getStyleArtists(styleId, { limit = 50, offset = 0 } = {}) {
  return callApi('/style/artist', { id: styleId, limit, offset });
}

export async function getSongWikiSummary(songId) {
  return callApi('/song/wiki/summary', { id: songId });
}

export async function getSongCreators(songId) {
  return callApi('/song/creators', { id: songId });
}

export async function getSimilarArtists(id) {
  return callApi('/simi/artist', { id });
}

export async function getPlaymodeIntelligenceList({ songId, playlistId, startSongId, count = 1 }) {
  return callApi('/playmode/intelligence/list', { id: songId, pid: playlistId, sid: startSongId || songId, count });
}

export async function getRecommendResource() {
  return callApi('/recommend/resource');
}

export async function getPersonalized({ limit = 30 } = {}) {
  return callApi('/personalized', { limit });
}

export async function getSearchSuggest(keywords) {
  return callApi('/search/suggest', { keywords });
}

export async function getSearchHotDetail() {
  return callApi('/search/hot/detail');
}

export async function getPlaylistCatlist() {
  return callApi('/playlist/catlist');
}

export async function getPlaylistHot() {
  return callApi('/playlist/hot');
}
