import { toSongDTO } from './toSongDTO.js';

/**
 * Backward-compatible playable song shape (strategy B).
 * Merges the stable DTO fields (title/artist/album/durationMs/coverUrl) onto
 * the original song object so legacy frontend reads (song.name/ar/dt) keep
 * working while new code can migrate to the stable fields.
 * (API-CONTRACT: additive / backward-compatible — never removes fields.)
 *
 * @param {object|null} song raw NetEase song (or already-normalized)
 * @returns {object|null} original fields + stable DTO fields, or null
 */
export function toPlayableSong(song) {
  if (!song) return null;
  return { ...song, ...toSongDTO(song) };
}
