/**
 * @typedef {object} Song
 * @property {string} id
 * @property {string} title
 * @property {string} artist
 * @property {string} album
 * @property {number} durationMs
 * @property {string=} coverUrl
 *
 * @typedef {object} MusicSourcePort
 * @property {(keywords: string, limit: number) => Promise<Song[]>} search
 * @property {(songId: string) => Promise<string|null>} songUrl
 * @property {(songId: string) => Promise<object|null>} lyric
 * @property {(songId: string) => Promise<Song[]>} similar
 * @property {(songIds: string[]) => Promise<Song[]>} details
 * @property {(uid: string) => Promise<Song[]>} likedSongs
 * @property {() => Promise<Song[]>} personalFm
 * @property {() => Promise<Song[]>} dailyRecommend
 * @property {(uid: string) => Promise<object[]>} userPlaylists
 * @property {(playlistId: string) => Promise<Song[]>} playlistTracks
 * @property {(songId: string) => Promise<void>} scrobble
 */

export {};
