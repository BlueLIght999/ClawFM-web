/**
 * Scheduler state construction pure rules — extracted from scheduler.js.
 *
 * Builds the radio state object from playhead + queue + audio URL.
 * Pure function: no side effects, no I/O, no mutations.
 */

import { toPlayableSong } from '../curation/toPlayableSong.js';

/**
 * Build the scheduler state object from playhead, queue, and audio URL.
 *
 * @param {object} input
 * @param {object|null} input.playhead Current playhead state.
 * @param {object} input.queue Queue with mode and upcomingSongs.
 * @param {string|null} input.audioUrl Cached audio URL for current song.
 * @param {number} input.elapsedMs Elapsed playback time in milliseconds.
 * @returns {object} Scheduler state object.
 * @throws Does not throw.
 * Constraint: maps all fields to stable Song DTO via toPlayableSong.
 */
export function buildSchedulerState({ playhead, queue, audioUrl, elapsedMs }) {
  const song = playhead?.currentSong ?? null;
  return {
    currentSong: toPlayableSong(song),
    startedAt: playhead?.startedAt ?? null,
    isPlaying: playhead?.isPlaying ?? false,
    audioUrl: audioUrl ?? null,
    queueMode: queue?.mode ?? 'normal',
    upcomingSongs: (queue?.upcomingSongs ?? []).map(toPlayableSong),
    elapsed: (elapsedMs ?? 0) / 1000,
    duration: (playhead?.songDuration ?? 0) / 1000,
  };
}
