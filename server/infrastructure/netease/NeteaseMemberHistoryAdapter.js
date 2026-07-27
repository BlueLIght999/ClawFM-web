/**
 * NeteaseMemberHistoryAdapter — 用成员 cookie 调 netease-api 拉听歌历史（P-B 路 1）。
 *
 * netease-api 跑在 localhost:4001（HTTP）。成员 cookie 通过 query 传入，与电台账号 cookie 隔离（RC6）。
 * fetchJson 可注入（测试用）。HTTP 失败抛错，由 MemberProfileService 捕获并降级到路 2。
 */
import config from '../../config.js';

const DEFAULT_API_BASE = `http://localhost:${config.netease.apiPort}`;

function firstArtist(song) {
  const ar = song?.ar || song?.artists || [];
  return Array.isArray(ar) && ar.length > 0 ? (ar[0]?.name || '') : '';
}

/**
 * 把 netease /user/record 的 allData 解析为 NeteaseHistorySignals（纯函数，可单测）。
 * genre/region/timeSlot 推断留空（P0 由路 2 兜底，后续可加 domain 推断）。
 */
export function parseRecord(allData) {
  const list = Array.isArray(allData) ? allData : [];
  const topSongs = [];
  const artistCounts = {};
  let totalPlays = 0;

  for (const item of list) {
    const playCount = Number(item?.playCount) || 0;
    const song = item?.song || {};
    const title = song.name || '';
    const artist = firstArtist(song);
    totalPlays += playCount;
    topSongs.push({ title, artist, playCount });
    if (artist) artistCounts[artist] = (artistCounts[artist] || 0) + playCount;
  }

  const topArtists = Object.entries(artistCounts)
    .map(([name, playCount]) => ({ name, playCount }))
    .sort((a, b) => b.playCount - a.playCount)
    .slice(0, 20);

  return {
    topArtists,
    topSongs,
    totalPlays,
    timeSlotCounts: {},
    genreCounts: {},
    regionCounts: {},
  };
}

/**
 * @param {object} [deps]
 * @param {string} [deps.apiBase]
 * @param {(url: string) => Promise<object>} [deps.fetchJson]
 */
export function createNeteaseMemberHistoryAdapter(deps = {}) {
  const apiBase = deps.apiBase || DEFAULT_API_BASE;
  const fetchJson = deps.fetchJson || (async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`NeteaseMemberHistory: HTTP ${res.status}`);
    return res.json();
  });

  return {
    async fetchMemberHistory(neteaseUid, cookie) {
      const url = `${apiBase}/user/record?uid=${encodeURIComponent(neteaseUid)}&cookie=${encodeURIComponent(cookie || '')}`;
      const body = await fetchJson(url);
      if (!body || body.code !== 200) {
        throw new Error(`NeteaseMemberHistory: bad response code=${body?.code}`);
      }
      return parseRecord(body.allData || body.weekData || []);
    },

    /**
     * 拉成员网易云歌单（F9 bring_playlist 用）。
     * @returns {Promise<Array<{id:string, name:string, trackCount:number, coverUrl:string}>>}
     */
    async fetchMemberPlaylists(neteaseUid, cookie) {
      const url = `${apiBase}/user/playlist?uid=${encodeURIComponent(neteaseUid)}&cookie=${encodeURIComponent(cookie || '')}`;
      const body = await fetchJson(url);
      if (!body || body.code !== 200) {
        throw new Error(`NeteaseMemberPlaylists: bad response code=${body?.code}`);
      }
      return parsePlaylists(body.playlist);
    },
  };
}

/**
 * 解析 netease /user/playlist 的 playlist 数组（纯函数，可单测）。
 * netease playlist id 永远是非零正整数，因此 id=0/null/undefined 都视为缺失并过滤掉。
 */
export function parsePlaylists(playlists) {
  const list = Array.isArray(playlists) ? playlists : [];
  const out = [];
  for (const p of list) {
    const rawId = p?.id ?? p?.playlistId;
    if (!rawId) continue; // 过滤掉 null/undefined/0/''/NaN
    out.push({
      id: String(rawId),
      name: p?.name || '',
      trackCount: Number(p?.trackCount) || 0,
      coverUrl: p?.coverImgUrl || p?.picUrl || '',
    });
  }
  return out;
}

export const neteaseMemberHistoryAdapter = createNeteaseMemberHistoryAdapter();
