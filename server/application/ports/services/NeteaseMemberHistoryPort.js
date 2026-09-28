/**
 * NeteaseMemberHistoryPort — 成员网易云历史拉取 Port（P-B 路 1）。
 * 实现见 infrastructure/netease/NeteaseMemberHistoryAdapter.js。
 *
 * @typedef {object} NeteaseHistorySignals
 * @property {{name:string, playCount:number}[]} topArtists
 * @property {{title:string, artist:string, playCount:number}[]} topSongs
 * @property {number} totalPlays
 * @property {Record<string, number>} timeSlotCounts   - morning/afternoon/evening/night/late_night
 * @property {Record<string, number>} genreCounts       - 曲风计数（推断）
 * @property {Record<string, number>} regionCounts      - 地域计数（推断）
 *
 * @typedef {object} NeteaseMemberHistoryPort
 * @property {(neteaseUid: string, cookie: string) => Promise<NeteaseHistorySignals>} fetchMemberHistory
 * @property {(neteaseUid: string, cookie: string) => Promise<Array<{id:string, name:string, trackCount:number, coverUrl:string}>>} fetchMemberPlaylists
 *   F9 `bring_playlist` 路径：InvitationService.respond 在成员接受邀请时拉其歌单。
 *   此前 port 只声明了 fetchMemberHistory，导致调用点报 TS2339——实现
 *   （NeteaseMemberHistoryAdapter）与调用方都已具备该方法，缺的是 port 声明本身。
 */

export {};
