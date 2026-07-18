import { artistName } from '../hosting/artistName.js';
import { firstTruthy } from './firstTruthy.js';

function firstString(...values) {
  return values.find(value => typeof value === 'string' && value.length > 0) || '';
}

/** Resolve both modern `al` and legacy `album` shapes to a scalar name. */
export function albumName(song) {
  return firstString(
    song?.al?.name,
    song?.album?.name,
    song?.album,
  );
}

function albumCoverUrl(song) {
  return firstString(
    song?.al?.picUrl,
    song?.album?.picUrl,
    song?.album?.blurPicUrl,
    song?.coverUrl,
    song?.picUrl,
  );
}

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
    title: firstString(song.name, song.title) || 'Unknown Track',
    artist: artistName(song),
    album: albumName(song),
    durationMs: firstTruthy(song.dt, song.durationMs, song.duration, 0),
    coverUrl: albumCoverUrl(song),
  };
}
