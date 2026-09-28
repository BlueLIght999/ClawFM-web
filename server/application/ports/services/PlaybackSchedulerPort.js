/**
 * @typedef {object} PlaybackState
 * @property {object|null} currentSong
 * @property {boolean} isPlaying
 * @property {number} elapsed
 * @property {number} duration
 * @property {string=} audioUrl
 *
 * @typedef {object} PlaybackSchedulerPort
 * @property {string} coldStartState - 'pending' | 'in-progress' | 'done'
 * @property {boolean} isPlaying
 * @property {object} playhead - { currentSong, isPlaying, startedAt }
 * @property {() => void} pause - pause playback
 * @property {() => Promise<void>} startWithQueue - start playing from the queue
 * @property {() => PlaybackState} getState - current playback state snapshot
 * @property {(song: object) => Promise<string|null>} getAudioUrl - resolve audio URL for a song
 * @property {() => void} speechComplete - signal that DJ speech has finished
 * @property {(state: object) => void} onStateChange - callback for playback position updates
 * @property {(song: object) => void} onSongChange - callback for song transitions
 * @property {(prevSong: object, nextSong: object, transitionId: number) => void} onDjSpeechNeeded - callback for DJ speech requests
 *   transitionId is the TransitionOrchestrator `_transitionId` counter (a number), not a
 *   string. It is only ever compared for equality against the current id
 *   (shouldHonorTransition / DjSpeechService stale-speech guards), and the domain rule
 *   in playback/transitionLifecycle.js already admits `number|string`, so the
 *   string-only tag here was simply wrong about the producer.
 * @property {() => object} getPlaybackPosition - current {elapsed, duration}
 */

export {};
