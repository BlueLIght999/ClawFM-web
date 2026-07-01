import { artistName } from './artistName.js';
import { firstTruthy } from '../curation/firstTruthy.js';

/**
 * Pure builder for the DJ transition prompt (song A → song B).
 * Extracted from claude.js generateDjResponse to move the ||-fallback chains
 * and album conditional out, lowering that function's complexity.
 *
 * @param {object} prevSong previous song
 * @param {object} nextSong next song
 * @param {string} timeOfDay time-of-day label
 * @returns {string} the user-role transition prompt
 */
export function buildTransitionPrompt(prevSong, nextSong, timeOfDay) {
  const prevTitle = firstTruthy(prevSong?.name, prevSong?.title, 'the last track');
  const prevArtist = artistName(prevSong);
  const nextTitle = firstTruthy(nextSong?.name, nextSong?.title, 'this next track');
  const nextArtist = artistName(nextSong);
  const album = firstTruthy(nextSong?.al?.name, nextSong?.album, '');
  const timeStr = firstTruthy(timeOfDay, 'this moment');
  const albumPart = album ? ` (${album})` : '';

  return `Previous: "${prevTitle}" by ${prevArtist}\nNext: "${nextTitle}" by ${nextArtist}${albumPart}\nTime: ${timeStr}\n\nGenerate a DJ transition.`;
}
