import { queue } from './queue.js';
import { recordListen } from '../db/history.js';
import {
  getSongUrl,
  getSongDetail,
  scrobbleSong,
} from './netease.js';
import { SpeechTimer } from './speech-timer.js';

const CROSSFADE_MS = 2500; // Start transition 2.5s before song ends
const DJ_SPEECH_BUFFER_MS = 4000; // Buffer for DJ speech
const SPEECH_GEN_TIMEOUT_MS = 15000; // Max time for LLM + TTS generation

export class RadioScheduler {
  constructor() {
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
    if (!this.playhead.isPlaying || !this.playhead.startedAt) return 0;
    return Math.min(Date.now() - this.playhead.startedAt, this.playhead.songDuration || 0);
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
    if (this.playhead.currentSong) {
      recordListen({
        song_id: this.playhead.currentSong.id || this.playhead.currentSong.song_id,
        title: this.playhead.currentSong.name || this.playhead.currentSong.title,
        artist: this._getArtist(this.playhead.currentSong),
        album: this.playhead.currentSong.al?.name || this.playhead.currentSong.album || '',
        duration: Math.floor((this.playhead.songDuration || 0) / 1000),
        source: 'queue',
      });
    }
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
    this.playhead.startedAt = Date.now() - positionMs;
    // Reschedule transition timer
    if (this.playhead.transitionTimer) clearTimeout(this.playhead.transitionTimer);
    if (this._speechTimer) {
      this._speechTimer.dispose();
      this._speechTimer = null;
    }
    const remaining = this.playhead.songDuration - positionMs - CROSSFADE_MS - DJ_SPEECH_BUFFER_MS;
    if (remaining > 0) {
      this.playhead.transitionTimer = setTimeout(() => this._onSongEnding(), Math.max(remaining, 5000));
    }
    this._notifyState();
  }

  pause() {
    if (!this.playhead.isPlaying) return;
    if (this.playhead.transitionTimer) clearTimeout(this.playhead.transitionTimer);
    if (this._speechTimer) {
      this._speechTimer.dispose();
      this._speechTimer = null;
    }
    this.playhead.remainingAtPause = this.playhead.songDuration - this.elapsed;
    this.playhead.isPlaying = false;
    this._notifyState();
  }

  resume() {
    if (this.playhead.isPlaying) return;
    if (!this.playhead.currentSong) return;
    this.playhead.startedAt = Date.now();
    this.playhead.songDuration = this.playhead.remainingAtPause || this.playhead.songDuration || 240000;
    this.playhead.isPlaying = true;
    const remaining = this.playhead.songDuration - CROSSFADE_MS - DJ_SPEECH_BUFFER_MS;
    if (remaining > 0) {
      this.playhead.transitionTimer = setTimeout(() => this._onSongEnding(), remaining);
    }
    this._notifyState();
  }

  async _startSong(song) {
    this._transitionId++;
    this.songsSinceLastSpeech++;
    this.playhead._advancing = false; // Transition complete, new song started
    this.playhead.currentSong = song;
    this.playhead.startedAt = Date.now();

    // Get duration
    const dur = song.dt || song.duration || 240000;
    this.playhead.songDuration = dur < 1000 ? dur * 1000 : dur;
    this.playhead.isPlaying = true;

    // Scrobble to NetEase (for FM recommendations)
    const sid = song.id || song.song_id;
    scrobbleSong(String(sid)).catch(() => {});

    // Await so audioUrl is cached before any getState() call reads it
    if (this.onSongChange) await this.onSongChange(song);

    // Set up next transition
    const remaining = this.playhead.songDuration - CROSSFADE_MS - DJ_SPEECH_BUFFER_MS;
    if (remaining > 0) {
      this.playhead.transitionTimer = setTimeout(() => this._onSongEnding(), Math.max(remaining, 5000));
    }

    this._notifyState();
  }

  _onSongEnding() {
    // Prevent double-advance from player:ended or skip() racing with transition
    if (this.playhead._advancing) return;
    this.playhead._advancing = true;
    const myId = this._transitionId;

    // Record as played
    if (this.playhead.currentSong) {
      recordListen({
        song_id: this.playhead.currentSong.id || this.playhead.currentSong.song_id,
        title: this.playhead.currentSong.name || this.playhead.currentSong.title,
        artist: this._getArtist(this.playhead.currentSong),
        album: this.playhead.currentSong.al?.name || this.playhead.currentSong.album || '',
        duration: Math.floor((this.playhead.songDuration || 0) / 1000),
        source: 'queue',
      });
    }

    const prevSong = this.playhead.currentSong;
    const nextSong = queue.peek();

    // Dispose any previous speech timer
    if (this._speechTimer) {
      this._speechTimer.dispose();
      this._speechTimer = null;
    }

    if (!nextSong) {
      // Queue exhausted — use longer timeout for refill (60s)
      this._speechTimer = new SpeechTimer({
        generationTimeoutMs: 60000,
        onGenerationTimeout: () => {
          if (this._transitionId !== myId) return;
          console.log('[Scheduler] Refill speech safety timeout — advancing without speech');
          this._advanceToNext();
        },
        onPlaybackTimeout: () => {
          if (this._transitionId !== myId) return;
          console.log('[Scheduler] Refill playback timeout — advancing');
          this._advanceToNext();
        },
      });
      this._speechTimer.startGeneration();
      if (this.onDjSpeechNeeded) this.onDjSpeechNeeded(prevSong, null, myId);
      return;
    }

    // Normal transition: split timeout for generation (15s) vs playback
    this._speechTimer = new SpeechTimer({
      generationTimeoutMs: SPEECH_GEN_TIMEOUT_MS,
      onGenerationTimeout: () => {
        if (this._transitionId !== myId) return;
        console.log('[Scheduler] Speech generation timeout — advancing without speech');
        this._advanceToNext();
      },
      onPlaybackTimeout: () => {
        if (this._transitionId !== myId) return;
        console.log('[Scheduler] Speech playback timeout — advancing');
        this._advanceToNext();
      },
    });
    this._speechTimer.startGeneration();

    // Trigger DJ speech generation (handler will call speechComplete() when client finishes)
    if (this.onDjSpeechNeeded) {
      this.onDjSpeechNeeded(prevSong, nextSong, myId);
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
      const result = await getSongUrl(String(sid));
      const url = result?.data?.[0]?.url;
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
      currentSong: song,
      startedAt: this.playhead.startedAt,
      isPlaying: this.playhead.isPlaying,
      audioUrl: sid ? this.audioUrlCache.get(String(sid))?.url || null : null,
      queueMode: queue.mode,
      upcomingSongs: queue.upcomingSongs,
      elapsed: this.elapsed / 1000,
      duration: (this.playhead.songDuration || 0) / 1000,
    };
  }

  _getArtist(song) {
    if (song.ar && Array.isArray(song.ar)) return song.ar.map(a => a.name).join(', ');
    if (song.artist) return song.artist;
    if (song.artists && Array.isArray(song.artists)) return song.artists.map(a => a.name || a).join(', ');
    return '';
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
