/**
 * @typedef {object} Song
 * @property {string} id
 * @property {string} title
 * @property {string} artist
 * @property {string} album
 * @property {number} durationMs
 * @property {string=} coverUrl
 * @property {number=} playCount
 *
 * @typedef {object} PlaylistDTO
 * @property {string} id
 * @property {string} name
 * @property {number} trackCount
 * @property {number} playCount
 * @property {string} creator
 * @property {string} coverUrl
 *
 * @typedef {object} ArtistDTO
 * @property {string} id
 * @property {string} name
 * @property {number} songCount
 * @property {string} picUrl
 *
 * @typedef {object} MusicSourcePort
 * @property {(keywords: string, limit: number) => Promise<Song[]>} search
 * @property {(keywords: string, limit: number) => Promise<PlaylistDTO[]>} searchPlaylists
 * @property {(keywords: string, limit: number) => Promise<ArtistDTO[]>} searchArtists
 * @property {(playlistId: string) => Promise<Song[]>} getPlaylistTracks
 * @property {(artistId: string, limit?: number) => Promise<Song[]>} artistHotSongs
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
