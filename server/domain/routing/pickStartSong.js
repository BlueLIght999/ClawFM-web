/**
 * Move the song whose title contains `startSong` to the front of the list.
 * Case-insensitive match on name||title. If no match (or empty startSong),
 * returns the list unchanged. Pure — extracted from router.js play_artist,
 * leaving the searchSongs IO in the caller.
 *
 * @param {Array<object>} songs candidate songs
 * @param {string} startSong requested starting song name
 * @returns {Array<object>} reordered list (match first), or original order
 */
export function pickStartSong(songs, startSong) {
  if (!startSong || songs.length === 0) return songs;
  const needle = startSong.toLowerCase();
  const match = songs.find((s) => (s.name || s.title || '').toLowerCase().includes(needle));
  if (!match) return songs;
  return [match, ...songs.filter((s) => s.id !== match.id)];
}
