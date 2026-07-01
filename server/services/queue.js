import { getLatestQueueSnapshot, saveQueueSnapshot } from '../db/history.js';

export class SongQueue {
  constructor() {
    this.past = [];
    this.current = null;
    this.future = [];
    this.mode = 'shuffle'; // 'sequential' | 'shuffle' | 'fm'
    this.stateVersion = 0;
  }

  get upcomingSongs() { return this.future.slice(0, 20); }
  get length() { return this.future.length; }
  get isEmpty() { return !this.current && this.future.length === 0; }
  get hasCurrent() { return !!this.current; }

  setMode(mode) {
    if (mode === 'shuffle' && this.mode !== 'shuffle') this.shuffle();
    this.mode = mode;
    this._changed();
  }

  addSongs(songs) {
    if (!songs || songs.length === 0) return;
    const deduped = songs.filter(s => {
      const id = s.id || s.song_id;
      if (this.current && (this.current.id === id || this.current.song_id === id)) return false;
      return !this.future.some(f => (f.id || f.song_id) === id);
    });
    if (this.mode === 'shuffle') {
      this._fisherYates(deduped);
    }
    this.future.push(...deduped);
    this._changed();
  }

  insertNext(song) {
    this.future.unshift(song);
    this._changed();
  }

  enqueue(song) {
    this.future.push(song);
    this._changed();
  }

  advance() {
    if (this.current) {
      this.past.push(this.current);
      if (this.past.length > 500) this.past = this.past.slice(-200);
    }
    if (this.future.length === 0) return null;
    this.current = this.future.shift();
    this._changed();
    return this.current;
  }

  peek() {
    return this.future.length > 0 ? this.future[0] : null;
  }

  goBack() {
    if (this.past.length === 0) return null;
    const prev = this.past.pop();
    if (this.current) this.future.unshift(this.current);
    this.current = prev;
    this._changed();
    return this.current;
  }

  clear() {
    this.past = [];
    this.current = null;
    this.future = [];
    this._changed();
  }

  shuffle() {
    this._fisherYates(this.future);
    this._changed();
  }

  removeFromFuture(songId) {
    this.future = this.future.filter(s => (s.id || s.song_id) !== songId);
    this._changed();
  }

  needsMore(threshold = 5) {
    return this.future.length < threshold;
  }

  // Persistence
  toState() {
    return {
      past: this.past.slice(-50),
      current: this.current,
      future: this.future.slice(0, 100),
      mode: this.mode,
      version: this.stateVersion,
    };
  }

  loadFromState(state) {
    if (!state) return;
    try {
      const s = typeof state === 'string' ? JSON.parse(state) : state;
      this.past = s.past || [];
      this.current = s.current || null;
      this.future = s.future || [];
      this.mode = s.mode || 'shuffle';
      this.stateVersion = s.version || 0;
    } catch (e) {
      console.error('[Queue] Failed to load state:', e.message);
    }
  }

  persist() {
    saveQueueSnapshot(JSON.stringify(this.toState()));
  }

  init() {
    const saved = getLatestQueueSnapshot();
    if (saved) this.loadFromState(saved);
  }

  _fisherYates(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  _changed() {
    this.stateVersion++;
  }
}

export const queue = new SongQueue();
