/**
 * NeteaseMemberHistoryPort — 成员网易云历史拉取 Port（P-B 路 1）。
 * 实现见 infrastructure/netease/NeteaseMemberHistoryAdapter.js。
 *
 * @typedef {object} NeteaseHistorySignals
 * @property {{name:string, playCount:number}[]} topArtists
 * @property {{title:string, artist:string, playCount:number}[]} topSongs
 * @property {number} totalPlays
 * @property {Record<string, number>} timeSlotCounts   — morning/afternoon/evening/night/late_night
 * @property {Record<string, number>} genreCounts       — 曲风计数（推断）
 * @property {Record<string, number>} regionCounts      — 地域计数（推断）
 *
 * @typedef {object} NeteaseMemberHistoryPort
 * @property {(neteaseUid: string, cookie: string) => Promise<NeteaseHistorySignals>} fetchMemberHistory
 */

export {};
