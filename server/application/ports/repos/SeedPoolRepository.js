/**
 * @typedef {object} SeedSong
 * @property {string} songId
 * @property {string} title
 * @property {string} artist
 * @property {string} album
 * @property {number} durationMs
 * @property {string} source
 * @property {string[]} genreTags
 * @property {number} playCount
 */

/**
 * @typedef {object} SeedPoolRepository
 * @property {(song: SeedSong) => void} upsert
 * @property {(songId: string) => void} incrementPlayCount
 * @property {(limit?: number) => SeedSong[]} all
 */

export {};
