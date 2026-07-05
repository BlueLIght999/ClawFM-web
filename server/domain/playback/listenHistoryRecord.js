import { artistName } from '../hosting/artistName.js';

/**
 * Build the ListenHistoryRepository payload for a played song.
 *
 * @param {{song: object|null, durationMs: number, source?: string}} input Played song context.
 * @returns {object|null} Repository payload, or null when there is no song to record.
 * @throws Does not throw.
 * Constraint: preserves legacy scheduler fields while accepting stable Song DTO fields.
 */
export function buildListenHistoryRecord({ song, durationMs, source = 'queue' }) {
  if (!song) return null;
  return {
    songId: String(song.id || song.song_id),
    title: song.name || song.title,
    artist: artistName(song),
    album: song.al?.name || song.album || '',
    durationSec: Math.floor((durationMs || 0) / 1000),
    source,
  };
}
