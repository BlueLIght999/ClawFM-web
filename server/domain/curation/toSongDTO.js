import { artistName } from '../hosting/artistName.js';
import { firstTruthy } from './firstTruthy.js';

/**
 * Pure Song DTO mapper — converts a raw NetEase song object
 * {id, name, ar, al, dt} into a clean, stable DTO
 * {id, title, artist, album, durationMs, coverUrl}.
 *
 * This is the ML2 anti-corruption seam: the frontend consumes this DTO's
 * stable fields (title/artist/...) instead of NetEase raw fields (ar/al/dt),
 * so a change in the music source no longer breaks the UI.
 *
 * @param {object|null} song raw song (NetEase or already-normalized)
 * @returns {{id,title,artist,album,durationMs,coverUrl}|null}
 */
export function toSongDTO(song) {
  if (!song) return null;
  return {
    id: String(song.id),
    title: firstTruthy(song.name, song.title, 'Unknown Track'),
    artist: artistName(song),
    album: firstTruthy(song.al?.name, song.album, ''),
    durationMs: firstTruthy(song.dt, song.duration, 0),
    coverUrl: firstTruthy(song.al?.picUrl, song.coverUrl, ''),
  };
}
