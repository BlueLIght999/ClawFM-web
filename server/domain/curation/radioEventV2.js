import { toSongDTO } from './toSongDTO.js';

export const RADIO_EVENT_SCHEMA_VERSION = 2;

function stableSongs(songs) {
  return Array.isArray(songs) ? songs.map(toSongDTO).filter(Boolean) : [];
}

/**
 * Projects legacy scheduler state into the Socket v2 public contract.
 * @param {object|null} state Scheduler state that may contain raw NetEase songs.
 * @returns {object} State with schemaVersion and stable current/upcoming Song DTOs.
 * @throws Does not throw for null state or missing song arrays.
 * Constraint: raw song properties are never spread into the returned payload.
 */
export function projectRadioStateV2(state) {
  const { currentSong = null, upcomingSongs = [], ...rest } = state || {};
  return {
    ...rest,
    schemaVersion: RADIO_EVENT_SCHEMA_VERSION,
    currentSong: toSongDTO(currentSong),
    upcomingSongs: stableSongs(upcomingSongs),
  };
}

/**
 * Projects a song-change payload into the Socket v2 public contract.
 * @param {object|null} payload Legacy song-change payload.
 * @returns {object} Payload containing only a stable Song DTO and playback metadata.
 * @throws Does not throw for null payload or song.
 * Constraint: non-song metadata is preserved, while raw song fields are discarded.
 */
export function projectSongChangeV2(payload) {
  const { song = null, ...rest } = payload || {};
  return {
    ...rest,
    schemaVersion: RADIO_EVENT_SCHEMA_VERSION,
    song: toSongDTO(song),
  };
}

/**
 * Projects a queue update into the Socket v2 public contract.
 * @param {object|null} payload Queue update that may contain raw songs.
 * @returns {object} Queue update with stable upcoming Song DTOs.
 * @throws Does not throw for null payload or missing upcomingSongs.
 * Constraint: queue ordering and non-song metadata such as mode are preserved.
 */
export function projectQueueUpdateV2(payload) {
  const { upcomingSongs = [], ...rest } = payload || {};
  return {
    ...rest,
    schemaVersion: RADIO_EVENT_SCHEMA_VERSION,
    upcomingSongs: stableSongs(upcomingSongs),
  };
}
