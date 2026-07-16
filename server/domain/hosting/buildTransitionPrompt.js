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
  const prevTitle = firstTruthy(prevSong?.name, prevSong?.title, '上一首');
  const prevArtist = artistName(prevSong);
  const nextTitle = firstTruthy(nextSong?.name, nextSong?.title, '下一首');
  const nextArtist = artistName(nextSong);
  const album = firstTruthy(nextSong?.al?.name, nextSong?.album, '');
  const timeStr = firstTruthy(timeOfDay, '此刻');
  const albumPart = album ? `（专辑：${album}）` : '';

  return `上一首：${prevArtist}的《${prevTitle}》\n下一首：${nextArtist}的《${nextTitle}》${albumPart}\n时段：${timeStr}\n\n请用中文生成一段 DJ 过渡词。`;
}
