import { toPlayableSong } from './toPlayableSong.js';

/**
 * Build the SONG_CHANGE event payload with a normalized song.
 * Reuses toPlayableSong so this second song path (independent of
 * getState/RADIO_STATE) also carries stable DTO fields + legacy fields.
 *
 * @param {object|null} song raw NetEase song
 * @param {number|null} startedAt playback start timestamp
 * @param {string|null} audioUrl resolved audio URL
 * @returns {{song, startedAt, audioUrl}}
 */
export function buildSongChangePayload(song, startedAt, audioUrl) {
  return {
    song: toPlayableSong(song),
    startedAt,
    audioUrl,
  };
}
