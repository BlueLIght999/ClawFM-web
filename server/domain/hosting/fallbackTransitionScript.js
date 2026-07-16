import { artistName } from './artistName.js';

/**
 * Pure fallback DJ transition script — used when the LLM is unavailable.
 * Extracted from claude.js fallbackTransition. No IO. This is the R1
 * ("radio never goes silent") degradation path for song transitions.
 *
 * @param {object|null} prev previous song (unused in output, kept for signature parity)
 * @param {object|null} next next song
 * @returns {{say:string, play:Array, reason:string, segue:string}}
 */
export function fallbackTransitionScript(prev, next) {
  const nextTitle = next?.name || next?.title || '这首歌';
  const nextArtist = artistName(next);
  return {
    say: `接下来，让我们听听${nextArtist}的《${nextTitle}》。`,
    play: next ? [{ id: next.id, name: nextTitle, artist: nextArtist }] : [],
    reason: 'fallback transition',
    segue: `即将播放：${nextArtist}的《${nextTitle}》`,
  };
}
