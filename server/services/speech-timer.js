/**
 * SpeechTimer — Split timeout management for DJ speech lifecycle.
 *
 * Two-phase timeout ensures the original bug is fixed:
 *   Bug: Single 30s timeout from song-end fired mid-playback because it
 *        included TTS generation time as part of the playback window.
 *   Fix: Split into generation timeout (LLM+TTS generation, 15s) and
 *        playback timeout (audio duration + 5s buffer), started when
 *        client confirms speech playback has begun.
 */

const MIN_PLAYBACK_TIMEOUT_MS = 5000; // Floor — even very short speech gets 5s
const PLAYBACK_BUFFER_MS = 5000;       // Buffer beyond estimated speech duration

export class SpeechTimer {
  /**
   * @param {Object} opts
   * @param {number} opts.generationTimeoutMs — max wait for LLM+TTS (default 15000)
   * @param {Function} opts.onGenerationTimeout — called when generation times out
   * @param {Function} [opts.onPlaybackTimeout] — called when playback times out
   */
  constructor({ generationTimeoutMs = 15000, onGenerationTimeout, onPlaybackTimeout } = {}) {
    this._generationTimeoutMs = generationTimeoutMs;
    this._onGenerationTimeout = onGenerationTimeout || (() => {});
    this._onPlaybackTimeout = onPlaybackTimeout || (() => {});

    this._genTimer = null;
    this._playTimer = null;
    this._generationTimedOut = false;
    this._started = false;
    this._disposed = false;
  }

  /** Start the generation phase timeout. */
  startGeneration() {
    if (this._disposed) return;
    this._genTimer = setTimeout(() => {
      this._genTimer = null;
      this._generationTimedOut = true;
      this._onGenerationTimeout();
    }, this._generationTimeoutMs);
  }

  /**
   * Client confirmed speech playback has begun.
   * Cancels generation timeout and starts playback timeout.
   * @param {number} speechDurationSeconds — estimated speech duration
   */
  speechStarted(speechDurationSeconds = 8) {
    if (this._disposed) return;
    if (this._generationTimedOut) return; // Too late — generation already failed

    // Cancel generation timeout
    if (this._genTimer) {
      clearTimeout(this._genTimer);
      this._genTimer = null;
    }

    this._started = true;

    const durationMs = Math.max(speechDurationSeconds, 0.5) * 1000;
    const timeoutMs = Math.max(durationMs + PLAYBACK_BUFFER_MS, MIN_PLAYBACK_TIMEOUT_MS);

    this._playTimer = setTimeout(() => {
      this._playTimer = null;
      this._onPlaybackTimeout();
    }, timeoutMs);
  }

  /** Client confirmed speech has finished playing. Cancels playback timeout. */
  speechFinished() {
    if (this._disposed) return;
    if (this._playTimer) {
      clearTimeout(this._playTimer);
      this._playTimer = null;
    }
  }

  /** Whether the generation phase has timed out. */
  get generationTimedOut() {
    return this._generationTimedOut;
  }

  /** Whether speech playback has started (speechStarted was called). */
  get hasStarted() {
    return this._started;
  }

  /** Cancel all timers. Safe to call multiple times. */
  dispose() {
    this._disposed = true;
    if (this._genTimer) {
      clearTimeout(this._genTimer);
      this._genTimer = null;
    }
    if (this._playTimer) {
      clearTimeout(this._playTimer);
      this._playTimer = null;
    }
  }
}
