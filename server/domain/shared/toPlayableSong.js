/**
 * Backward-compatible playable song shape (strategy B).
 * Merges the stable DTO fields (title/artist/album/durationMs/coverUrl) onto
 * the original song object so legacy frontend reads (song.name/ar/dt) keep
 * working while new code can migrate to the stable fields.
 * (API-CONTRACT: additive / backward-compatible — never removes fields.)
 *
 * Shared kernel: playback and curation both hand songs across the seam, so the
 * merge rule cannot belong to either one of them.
 *
 * @param {object|null} song raw song (or already-normalized)
 * @returns {object|null} original fields + stable DTO fields, or null
 */
import { toSongDTO } from './toSongDTO.js';

export function toPlayableSong(song) {
  if (!song) return null;
  return { ...song, ...toSongDTO(song) };
}
