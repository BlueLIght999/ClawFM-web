/**
 * Live version filtering — pure domain rules.
 *
 * Detects and filters out live versions, remixes, demos, instrumentals, etc.
 * Extracted from services/router.js for reusability and testability.
 */

const LIVE_PATTERNS = [
  /\blive\b/i, /现场/, /演唱会/, /音乐会/, /音乐节/, /巡演/, /公演/,
  /\(\s*live\s*\)/i, /\[\s*live\s*\]/i, /\bacoustic\b/i, /\bunplugged\b/i,
  /\bremix\b/i, /混音/, /伴奏/, /\binstrumental\b/i, /\bdemo\b/i,
];

/**
 * Check if a song is a live/remix/demo version.
 * @param {object|string} song — song object with name/title field, or raw name string
 * @returns {boolean}
 */
export function isLiveVersion(song) {
  const name = typeof song === 'string' ? song : (song?.name || song?.title || '');
  if (!name) return false;
  for (const pattern of LIVE_PATTERNS) {
    if (pattern.test(name)) return true;
  }
  if (/[([]\s*live(\s+version)?\s*[)\]]/i.test(name)) return true;
  return false;
}

/**
 * Filter out live/remix/demo versions from a song list.
 * Does not mutate the input array.
 * @param {Array<object>} songs
 * @returns {Array<object>}
 */
export function filterLiveVersions(songs) {
  return songs.filter(s => !isLiveVersion(s));
}
