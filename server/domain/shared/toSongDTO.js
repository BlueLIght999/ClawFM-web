/**
 * Pure Song DTO mapper — converts a raw music-source song object
 * {id, name, ar, al, dt} into a clean, stable DTO
 * {id, title, artist, album, durationMs, coverUrl}.
 *
 * Shared kernel: this is the ML2 anti-corruption seam. The frontend consumes
 * the stable fields (title/artist/...) instead of the source's raw fields
 * (ar/al/dt), so a change of music source no longer breaks the UI. It is a
 * shape adapter, not a curation rule — curation, playback and hosting all
 * read the same DTO, so it must not be owned by any one of them.
 */
import { artistName } from './artistName.js';
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
 * @param {object|null} song raw song (or already-normalized)
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
