/**
 * Extract the song ID from a song-like object.
 * Handles both camelCase (id) and snake_case (song_id) for D5 compliance.
 * Services/ should use this instead of directly accessing song_id.
 *
 * @param {{id?: string|number, song_id?: string|number}} song
 * @returns {string}
 */
export function songId(song) {
  if (!song) return '';
  return String(song.id ?? song.song_id ?? '');
}

/**
 * Extract the played-at timestamp from a play record.
 * Handles both camelCase (playedAt) and snake_case (played_at) for D5 compliance.
 *
 * @param {{playedAt?: string, played_at?: string}} record
 * @returns {string|undefined}
 */
export function playedAt(record) {
  if (!record) return undefined;
  return record.playedAt ?? record.played_at;
}
