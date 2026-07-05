/**
 * @typedef {object} PlayRecord
 * @property {string} songId
 * @property {string} title
 * @property {string} artist
 * @property {string} album
 * @property {number} durationSec
 * @property {string} source
 * @property {string=} playedAt
 */

/**
 * @typedef {object} ListenHistoryRepository
 * @property {(play: PlayRecord) => void} record
 * @property {(limit: number) => string[]} recentSongIds
 * @property {(hours: number) => {artist: string, count: number}[]} artistPlayCount
 * @property {(limit: number) => PlayRecord[]} history
 */

export {};
