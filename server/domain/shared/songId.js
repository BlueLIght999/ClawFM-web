/**
 * Song-identity and play-record extractors.
 *
 * Shared kernel: every context that touches a song or a play record needs to
 * read its identity, and they must all agree on the camelCase/snake_case
 * tolerance required by D5 (DB rows never cross the infrastructure boundary
 * untranslated). Owning these in one context would force every other context
 * to import across a boundary, so they live here.
 */

/**
 * Extract the song ID from a song-like object.
 * Handles both camelCase (id) and snake_case (song_id) for D5 compliance.
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
