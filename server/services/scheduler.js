/**
 * Scheduler — thin orchestration layer for radio playback.
 *
 * Domain logic extracted to:
 *   domain/playback/AudioUrlCache.js — audio URL caching with TTL
 *   domain/playback/TransitionOrchestrator.js — song transition lifecycle
 *   domain/playback/playheadRules.js — pause/resume/seek/elapsed
 *   domain/playback/transitionTiming.js — duration normalization + delay calc
 *   domain/playback/listenHistoryRecord.js — history record builder
 *   domain/curation/toPlayableSong.js — song DTO mapping
 */

import { queue } from './queue.js';
import { buildListenHistoryRecord } from '../domain/playback/listenHistoryRecord.js';
import {
  pausePlayhead,
  playheadElapsedMs,
  resumePlayhead,
  seekPlayhead,
} from '../domain/playback/playheadRules.js';
import { songId } from '../domain/curation/songId.js';
import { AudioUrlCache } from '../domain/playback/AudioUrlCache.js';
import { TransitionOrchestrator } from '../domain/playback/TransitionOrchestrator.js';
import {
  startSongPlayhead,
  transitionDelayForPlayback,
  skipOutcome,
} from '../domain/playback/playbackProgressionRules.js';
import { buildSchedulerState } from '../domain/playback/schedulerStateRules.js';
import { shouldTriggerRefill, refillOutcome } from '../domain/playback/refillRules.js';

export class RadioScheduler {
  constructor({ music = null, listenHistory = null } = {}) {
    this.music = music;
    this.listenHistory = listenHistory;
    this.playhead = {
      currentSong: null,
      startedAt: null,
      songDuration: null,
      isPlaying: false,
      transitionTimer: null,
    };
    this.onSongChange = null;
    this.onDjSpeechNeeded = null;
    this.onStateChange = null;
    this.audioUrlCache = new AudioUrlCache({ music });
    this.coldStartState = 'pending';
    this.songsSinceLastSpeech = 0;

    this._transitionOrch = new TransitionOrchestrator({
      playhead: this.playhead,
      queue,
      listenHistory,
      onDjSpeechNeeded: null,
      onAdvance: () => this._advanceToNext(),
    });
  }

  configure({ music, listenHistory }) {
    if (music) {
      this.music = music;
      this.audioUrlCache.music = music;
    }
    if (listenHistory) this.listenHistory = listenHistory;
    this._transitionOrch.listenHistory = listenHistory;
  }

  get isPlaying() { return this.playhead.isPlaying; }
  get currentSong() { return this.playhead.currentSong; }
  get isAdvancing() { return !!this.playhead._advancing; }
  get elapsed() { return playheadElapsedMs(this.playhead, Date.now()); }

  prepareQueue() {
    if (queue.isEmpty) { console.log('[Scheduler] Queue empty, nothing to prepare'); return false; }
    if (!queue.hasCurrent) { const song = queue.advance(); if (!song) return false; }
    console.log('[Scheduler] Queue prepared, current:', queue.current?.name || queue.current?.title);
    return true;
  }

  async startWithQueue() {
    if (queue.isEmpty) { console.log('[Scheduler] Queue empty, nothing to play'); return; }
    if (!queue.hasCurrent) { const song = queue.advance(); if (!song) return; }
    await this._startSong(queue.current);
  }

  async skip() {
    this._cancelTransition();
    const skipHistoryRecord = buildListenHistoryRecord({
      song: this.playhead.currentSong,
      durationMs: this.playhead.songDuration,
    });
    if (skipHistoryRecord) this.listenHistory.record(skipHistoryRecord);
    const song = queue.advance();
    if (song) {
      await this._startSong(song);
      return;
    }
    // Queue exhausted — attempt refill before giving up
    await this._attemptRefillRecovery();
  }

  async previous() {
    this._cancelTransition();
    const song = queue.goBack();
    if (!song) return;
    await this._startSong(song);
  }

  seek(positionSeconds) {
    const positionMs = positionSeconds * 1000;
    this.playhead = seekPlayhead(this.playhead, { positionMs, nowMs: Date.now() });
    this._syncPlayheadRef();
    this._cancelTransition();
    if (this.playhead.isPlaying) {
      const transitionDelay = transitionDelayForPlayback({
        durationMs: this.playhead.songDuration,
        elapsedMs: positionMs,
      });
      if (transitionDelay !== null) {
        this.playhead.transitionTimer = setTimeout(() => this._onSongEnding(), transitionDelay);
      }
    }
    this._notifyState();
  }

  pause() {
    const nextPlayhead = pausePlayhead(this.playhead, Date.now());
    if (nextPlayhead === this.playhead) return;
    this._cancelTransition();
    this.playhead = nextPlayhead;
    this._syncPlayheadRef();
    this._notifyState();
  }

  resume() {
    const nextPlayhead = resumePlayhead(this.playhead, Date.now());
    if (nextPlayhead === this.playhead) return;
    this.playhead = nextPlayhead;
    this._syncPlayheadRef();
    const transitionDelay = transitionDelayForPlayback({
      durationMs: this.playhead.songDuration,
      minimumDelayMs: 0,
    });
    if (transitionDelay !== null) {
      this.playhead.transitionTimer = setTimeout(() => this._onSongEnding(), transitionDelay);
    }
    this._notifyState();
  }

  async _startSong(song) {
    const newPlayhead = startSongPlayhead(song, Date.now());
    this.playhead.currentSong = newPlayhead.currentSong;
    this.playhead.startedAt = newPlayhead.startedAt;
    this.playhead.songDuration = newPlayhead.songDuration;
    this.playhead.isPlaying = newPlayhead.isPlaying;
    this.playhead._advancing = newPlayhead._advancing;
    this.songsSinceLastSpeech++;

    const sid = songId(song);
    if (this.music) this.music.scrobble(sid).catch(e => console.warn('[Scheduler] Scrobble failed (degraded):', e.message));
    if (this.onSongChange) await this.onSongChange(song);

    // Clear any existing transition timer before setting a new one (H3: race condition fix)
    if (this.playhead.transitionTimer) {
      clearTimeout(this.playhead.transitionTimer);
    }
    const transitionDelay = transitionDelayForPlayback({ durationMs: this.playhead.songDuration });
    if (transitionDelay !== null) {
      this.playhead.transitionTimer = setTimeout(() => this._onSongEnding(), transitionDelay);
    }
    this._notifyState();
  }

  _onSongEnding() {
    this._transitionOrch.playhead = this.playhead;
    this._transitionOrch.onDjSpeechNeeded = this.onDjSpeechNeeded;
    this._transitionOrch.onSongEnding();
  }

  speechGenerationDone(speechDurationSec = 8) {
    this._transitionOrch.speechGenerationDone(speechDurationSec);
  }

  speechComplete() {
    this._transitionOrch.speechComplete();
  }

  async _advanceToNext() {
    const song = queue.advance();
    if (song) {
      await this._startSong(song);
      queue.persist();
      return;
    }
    // R1 guard: queue exhausted after transition — attempt refill recovery
    await this._attemptRefillRecovery();
  }

  async _attemptRefillRecovery() {
    const needsRefill = shouldTriggerRefill({
      queueLength: queue.length,
      isPlaying: this.playhead.isPlaying,
      hasCurrentSong: !!this.playhead.currentSong,
    });

    if (!needsRefill) {
      this._notifyState();
      return;
    }

    const outcome = refillOutcome({
      queueHasNext: false,
      refillSong: null,
      refillAttempted: false,
    });

    if (outcome.action === 'triggerRefill' && this.refillProvider) {
      try {
        const refilledSongs = await this.refillProvider();
        if (refilledSongs && refilledSongs.length > 0) {
          // Songs were added to the queue by refillProvider; advance to play first
          const nextSong = queue.advance();
          if (nextSong) {
            await this._startSong(nextSong);
            queue.persist();
            return;
          }
        }
      } catch (e) {
        console.warn('[Scheduler] Refill provider failed:', e.message);
      }
    }

    // Refill failed or unavailable — stop gracefully
    console.warn('[Scheduler] R1 warning: refill failed — radio going silent');
    this.playhead.currentSong = null;
    this.playhead.isPlaying = false;
    this._notifyState();
  }

  _cancelTransition() {
    this.playhead._advancing = false;
    if (this.playhead.transitionTimer) clearTimeout(this.playhead.transitionTimer);
    this._transitionOrch.cancel();
  }

  // M4: Keep TransitionOrchestrator's playhead reference in sync after seek/pause/resume
  _syncPlayheadRef() {
    this._transitionOrch.playhead = this.playhead;
  }

  async getAudioUrl(song) {
    return this.audioUrlCache.get(song);
  }

  getPlaybackPosition() {
    return {
      elapsed: this.elapsed / 1000,
      duration: (this.playhead.songDuration || 0) / 1000,
      isPlaying: this.playhead.isPlaying,
    };
  }

  getState() {
    const song = this.playhead.currentSong;
    const sid = song ? songId(song) : null;
    return buildSchedulerState({
      playhead: this.playhead,
      queue,
      audioUrl: sid ? this.audioUrlCache.getCachedUrl(String(sid)) : null,
      elapsedMs: this.elapsed,
    });
  }

  _notifyState() {
    if (this.onStateChange) this.onStateChange(this.getState());
  }

  destroy() {
    if (this.playhead.transitionTimer) clearTimeout(this.playhead.transitionTimer);
    this._transitionOrch.cancel();
  }
}

export const scheduler = new RadioScheduler();
