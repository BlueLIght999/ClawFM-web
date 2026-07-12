import { queue } from './queue.js';
import { SpeechTimer } from '../domain/playback/speechTimer.js';
import { toPlayableSong } from '../domain/curation/toPlayableSong.js';
import { buildListenHistoryRecord } from '../domain/playback/listenHistoryRecord.js';
import {
  pausePlayhead,
  playheadElapsedMs,
  resumePlayhead,
  seekPlayhead,
} from '../domain/playback/playheadRules.js';
import {
  beginTransitionIfIdle,
  shouldHonorTransition,
  transitionSpeechPlan,
} from '../domain/playback/transitionLifecycle.js';
import { normalizePlaybackDurationMs, nextTransitionDelayMs } from '../domain/playback/transitionTiming.js';
import { legacyListenHistoryRepository } from '../infrastructure/persistence/repositories/LegacyListenHistoryRepository.js';
import { legacyNeteaseMusicSourceAdapter } from '../infrastructure/music/LegacyNeteaseMusicSourceAdapter.js';

export class RadioScheduler {
  constructor({
    music = legacyNeteaseMusicSourceAdapter,
    listenHistory = legacyListenHistoryRepository,
  } = {}) {
    this.music = music;
    this.listenHistory = listenHistory;
    this.playhead = {
      currentSong: null,
      startedAt: null,
      songDuration: null,
      isPlaying: false,
      transitionTimer: null,
    };
    this.onSongChange = null; // Callback(song)
    this.onDjSpeechNeeded = null; // Callback(prevSong, nextSong)
    this.onStateChange = null; // Callback()
    this.audioUrlCache = new Map();
    this.coldStartState = 'pending'; // 'pending' | 'in-progress' | 'done'
    this._transitionId = 0;
    this.songsSinceLastSpeech = 0;
  }

  get isPlaying() { return this.playhead.isPlaying; }
  get currentSong() { return this.playhead.currentSong; }
  get isAdvancing() { return !!this.playhead._advancing; }
  get elapsed() {
    return playheadElapsedMs(this.playhead, Date.now());
  }

  prepareQueue() {
    if (queue.isEmpty) { console.log('[Scheduler] Queue empty, nothing to prepare'); return false; }
    if (!queue.hasCurrent) { const song = queue.advance(); if (!song) return false; }
    console.log('[Scheduler] Queue prepared, current:', queue.current?.name || queue.current?.title);
    return true;
  }

  async startWithQueue() {
    if (queue.isEmpty) {
      console.log('[Scheduler] Queue empty, nothing to play');
      return;
    }
    if (!queue.hasCurrent) {
      const song = queue.advance();
      if (!song) return;
    }
    await this._startSong(queue.current);
  }

  async skip() {
    this.playhead._advancing = false; // Cancel any in-progress transition
    if (this.playhead.transitionTimer) clearTimeout(this.playhead.transitionTimer);
    if (this._speechTimer) {
      this._speechTimer.dispose();
      this._speechTimer = null;
    }
    const skipHistoryRecord = buildListenHistoryRecord({
      song: this.playhead.currentSong,
      durationMs: this.playhead.songDuration,
    });
    if (skipHistoryRecord) this.listenHistory.record(skipHistoryRecord);
    const song = queue.advance();
    if (!song) {
      this.playhead.currentSong = null;
      this.playhead.isPlaying = false;
      this._notifyState();
      return;
    }
    await this._startSong(song);
  }

  async previous() {
    this.playhead._advancing = false;
    if (this.playhead.transitionTimer) clearTimeout(this.playhead.transitionTimer);
    if (this._speechTimer) {
      this._speechTimer.dispose();
      this._speechTimer = null;
    }
    const song = queue.goBack();
    if (!song) return;
    await this._startSong(song);
  }

  seek(positionSeconds) {
    const positionMs = positionSeconds * 1000;
    // Adjust startedAt so elapsed ≈ positionMs
    this.playhead = seekPlayhead(this.playhead, { positionMs, nowMs: Date.now() });
    // Reschedule transition timer
    if (this.playhead.transitionTimer) clearTimeout(this.playhead.transitionTimer);
    if (this._speechTimer) {
      this._speechTimer.dispose();
      this._speechTimer = null;
    }
    const transitionDelay = nextTransitionDelayMs({
      durationMs: this.playhead.songDuration,
      elapsedMs: positionMs,
    });
    if (transitionDelay !== null) {
      this.playhead.transitionTimer = setTimeout(() => this._onSongEnding(), transitionDelay);
    }
    this._notifyState();
  }

  pause() {
    const nextPlayhead = pausePlayhead(this.playhead, Date.now());
    if (nextPlayhead === this.playhead) return;
    if (this.playhead.transitionTimer) clearTimeout(this.playhead.transitionTimer);
    if (this._speechTimer) {
      this._speechTimer.dispose();
      this._speechTimer = null;
    }
    this.playhead = nextPlayhead;
    this._notifyState();
  }

  resume() {
    const nextPlayhead = resumePlayhead(this.playhead, Date.now());
    if (nextPlayhead === this.playhead) return;
    this.playhead = nextPlayhead;
    // Resume historically used the raw positive delay; keep that timing while sharing the rule.
    const transitionDelay = nextTransitionDelayMs({
      durationMs: this.playhead.songDuration,
      minimumDelayMs: 0,
    });
    if (transitionDelay !== null) {
      this.playhead.transitionTimer = setTimeout(() => this._onSongEnding(), transitionDelay);
    }
    this._notifyState();
  }

  async _startSong(song) {
    this._transitionId++;
    this.songsSinceLastSpeech++;
    this.playhead._advancing = false; // Transition complete, new song started
    this.playhead.currentSong = song;
    this.playhead.startedAt = Date.now();

    this.playhead.songDuration = normalizePlaybackDurationMs(song);
    this.playhead.isPlaying = true;

    // Scrobble to NetEase (for FM recommendations)
    const sid = song.id || song.song_id;
    this.music.scrobble(String(sid)).catch(() => {});

    // Await so audioUrl is cached before any getState() call reads it
    if (this.onSongChange) await this.onSongChange(song);

    // Set up next transition
    const transitionDelay = nextTransitionDelayMs({ durationMs: this.playhead.songDuration });
    if (transitionDelay !== null) {
      this.playhead.transitionTimer = setTimeout(() => this._onSongEnding(), transitionDelay);
    }

    this._notifyState();
  }

  _onSongEnding() {
    const transitionStart = beginTransitionIfIdle(this.playhead, this._transitionId);
    if (!transitionStart.shouldStart) return;
    this.playhead = transitionStart.playhead;
    const myId = transitionStart.transitionId;

    const transitionHistoryRecord = buildListenHistoryRecord({
      song: this.playhead.currentSong,
      durationMs: this.playhead.songDuration,
    });
    if (transitionHistoryRecord) this.listenHistory.record(transitionHistoryRecord);

    const prevSong = this.playhead.currentSong;
    const nextSong = queue.peek();
    const speechPlan = transitionSpeechPlan(nextSong);

    // Dispose any previous speech timer
    if (this._speechTimer) {
      this._speechTimer.dispose();
      this._speechTimer = null;
    }

    if (speechPlan.kind === 'refill') {
      // Queue exhausted — use longer timeout for refill (60s)
      this._speechTimer = new SpeechTimer({
        generationTimeoutMs: speechPlan.generationTimeoutMs,
        onGenerationTimeout: () => {
          if (!shouldHonorTransition({ currentTransitionId: this._transitionId, expectedTransitionId: myId })) return;
          console.log('[Scheduler] Refill speech safety timeout — advancing without speech');
          this._advanceToNext();
        },
        onPlaybackTimeout: () => {
          if (!shouldHonorTransition({ currentTransitionId: this._transitionId, expectedTransitionId: myId })) return;
          console.log('[Scheduler] Refill playback timeout — advancing');
          this._advanceToNext();
        },
      });
      this._speechTimer.startGeneration();
      if (this.onDjSpeechNeeded) this.onDjSpeechNeeded(prevSong, speechPlan.nextSong, myId);
      return;
    }

    // Normal transition: split timeout for generation (15s) vs playback
    this._speechTimer = new SpeechTimer({
      generationTimeoutMs: speechPlan.generationTimeoutMs,
      onGenerationTimeout: () => {
        if (!shouldHonorTransition({ currentTransitionId: this._transitionId, expectedTransitionId: myId })) return;
        console.log('[Scheduler] Speech generation timeout — advancing without speech');
        this._advanceToNext();
      },
      onPlaybackTimeout: () => {
        if (!shouldHonorTransition({ currentTransitionId: this._transitionId, expectedTransitionId: myId })) return;
        console.log('[Scheduler] Speech playback timeout — advancing');
        this._advanceToNext();
      },
    });
    this._speechTimer.startGeneration();

    // Trigger DJ speech generation (handler will call speechComplete() when client finishes)
    if (this.onDjSpeechNeeded) {
      this.onDjSpeechNeeded(prevSong, speechPlan.nextSong, myId);
    } else {
      this._advanceToNext();
    }
  }

  /** Called by handler after TTS generation succeeds, with estimated speech duration in seconds. */
  speechGenerationDone(speechDurationSec = 8) {
    if (this._speechTimer) {
      this._speechTimer.speechStarted(speechDurationSec);
    }
  }

  speechComplete() {
    if (this._speechTimer) {
      this._speechTimer.speechFinished();
      this._speechTimer.dispose();
      this._speechTimer = null;
    }
    if (!this.playhead._advancing) {
      console.log('[Scheduler] speechComplete called but not advancing — already transitioned');
      return;
    }
    this._advanceToNext();
  }

  async _advanceToNext() {
    const song = queue.advance();
    if (song) {
      await this._startSong(song);
      queue.persist();
    }
  }

  async getAudioUrl(song) {
    const sid = song.id || song.song_id;
    const cached = this.audioUrlCache.get(String(sid));
    if (cached && cached.expires > Date.now()) return cached.url;

    try {
      const url = await this.music.songUrl(String(sid));
      if (url) {
        this.audioUrlCache.set(String(sid), { url, expires: Date.now() + 15 * 60 * 1000 });
        return url;
      }
    } catch (e) {
      console.error(`[Scheduler] Failed to get URL for ${sid}:`, e.message);
    }
    return null;
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
    const sid = song ? (song.id || song.song_id) : null;
    return {
      currentSong: toPlayableSong(song),
      startedAt: this.playhead.startedAt,
      isPlaying: this.playhead.isPlaying,
      audioUrl: sid ? this.audioUrlCache.get(String(sid))?.url || null : null,
      queueMode: queue.mode,
      upcomingSongs: queue.upcomingSongs.map(toPlayableSong),
      elapsed: this.elapsed / 1000,
      duration: (this.playhead.songDuration || 0) / 1000,
    };
  }

  _notifyState() {
    if (this.onStateChange) this.onStateChange(this.getState());
  }

  destroy() {
    if (this.playhead.transitionTimer) clearTimeout(this.playhead.transitionTimer);
    if (this._speechTimer) { this._speechTimer.dispose(); this._speechTimer = null; }
  }
}

export const scheduler = new RadioScheduler();
