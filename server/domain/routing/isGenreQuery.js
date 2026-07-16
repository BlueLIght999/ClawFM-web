/**
 * Whether the text contains a genre/instrument/style keyword
 * (case-insensitive).
 *
 * Now delegates to genreDict.matchGenre for richer matching
 * (aliases, seed artists, playlist queries) while maintaining
 * backward-compatible boolean return.
 *
 * @param {string} text
 * @returns {boolean}
 */
import { matchGenre } from './genreDict.js';

export function isGenreQuery(text) {
  return matchGenre(text) !== null;
}
