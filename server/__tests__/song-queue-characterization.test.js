import { describe, it, expect } from 'vitest';
import { SongQueue } from '../domain/playback/SongQueue.js';

describe('SongQueue characterization', () => {
  describe('constructor', () => {
    it('starts with empty past/current/future', () => {
      const q = new SongQueue();
      expect(q.past).toEqual([]);
      expect(q.current).toBeNull();
      expect(q.future).toEqual([]);
    });

    it('defaults to shuffle mode', () => {
      const q = new SongQueue();
      expect(q.mode).toBe('shuffle');
    });

    it('starts with stateVersion 0', () => {
      const q = new SongQueue();
      expect(q.stateVersion).toBe(0);
    });
  });

  describe('getters', () => {
    it('upcomingSongs returns first 20 of future', () => {
      const q = new SongQueue();
      const songs = Array.from({ length: 25 }, (_, i) => ({ id: i }));
      q.future = songs;
      expect(q.upcomingSongs).toHaveLength(20);
      expect(q.upcomingSongs[0].id).toBe(0);
    });

    it('length returns future length', () => {
      const q = new SongQueue();
      q.future = [{ id: 1 }, { id: 2 }];
      expect(q.length).toBe(2);
    });

    it('isEmpty when no current and no future', () => {
      const q = new SongQueue();
      expect(q.isEmpty).toBe(true);
      q.future = [{ id: 1 }];
      expect(q.isEmpty).toBe(false);
      q.future = [];
      q.current = { id: 1 };
      expect(q.isEmpty).toBe(false);
    });

    it('hasCurrent when current is set', () => {
      const q = new SongQueue();
      expect(q.hasCurrent).toBe(false);
      q.current = { id: 1 };
      expect(q.hasCurrent).toBe(true);
    });
  });

  describe('addSongs', () => {
    it('adds songs to future', () => {
      const q = new SongQueue();
      q.mode = 'sequential';
      q.addSongs([{ id: 1 }, { id: 2 }]);
      expect(q.future).toHaveLength(2);
    });

    it('deduplicates against current and future by id', () => {
      const q = new SongQueue();
      q.mode = 'sequential';
      q.current = { id: 1 };
      q.future = [{ id: 2 }];
      q.addSongs([{ id: 1 }, { id: 2 }, { id: 3 }]);
      // future already had {id:2}, only {id:3} survives dedup
      expect(q.future).toHaveLength(2);
      expect(q.future[1].id).toBe(3);
    });

    it('deduplicates by song_id field', () => {
      const q = new SongQueue();
      q.mode = 'sequential';
      q.future = [{ song_id: 5 }];
      q.addSongs([{ song_id: 5 }, { id: 6 }]);
      // future already had {song_id:5}, only {id:6} survives dedup
      expect(q.future).toHaveLength(2);
      expect(q.future[1].id).toBe(6);
    });

    it('ignores empty or null input', () => {
      const q = new SongQueue();
      q.addSongs([]);
      q.addSongs(null);
      expect(q.future).toEqual([]);
    });

    it('shuffles in shuffle mode', () => {
      const q = new SongQueue();
      // With 100 songs, shuffle should almost certainly change order
      const songs = Array.from({ length: 100 }, (_, i) => ({ id: i }));
      q.addSongs(songs);
      const ids = q.future.map(s => s.id);
      expect(ids).not.toEqual(Array.from({ length: 100 }, (_, i) => i));
    });

    it('does NOT shuffle in sequential mode', () => {
      const q = new SongQueue();
      q.mode = 'sequential';
      const songs = [{ id: 1 }, { id: 2 }, { id: 3 }];
      q.addSongs(songs);
      expect(q.future.map(s => s.id)).toEqual([1, 2, 3]);
    });

    it('increments stateVersion', () => {
      const q = new SongQueue();
      q.mode = 'sequential';
      const v = q.stateVersion;
      q.addSongs([{ id: 1 }]);
      expect(q.stateVersion).toBe(v + 1);
    });
  });

  describe('insertNext', () => {
    it('inserts at front of future', () => {
      const q = new SongQueue();
      q.future = [{ id: 1 }];
      q.insertNext({ id: 99 });
      expect(q.future[0].id).toBe(99);
    });
  });

  describe('enqueue', () => {
    it('appends to end of future', () => {
      const q = new SongQueue();
      q.future = [{ id: 1 }];
      q.enqueue({ id: 99 });
      expect(q.future[q.future.length - 1].id).toBe(99);
    });
  });

  describe('advance', () => {
    it('moves current to past and future[0] to current', () => {
      const q = new SongQueue();
      q.current = { id: 1 };
      q.future = [{ id: 2 }, { id: 3 }];
      const next = q.advance();
      expect(next.id).toBe(2);
      expect(q.current.id).toBe(2);
      expect(q.past).toHaveLength(1);
      expect(q.past[0].id).toBe(1);
      expect(q.future).toHaveLength(1);
    });

    it('returns null when future is empty', () => {
      const q = new SongQueue();
      expect(q.advance()).toBeNull();
    });

    it('trims past to 200 when exceeding 500', () => {
      const q = new SongQueue();
      q.past = Array.from({ length: 500 }, (_, i) => ({ id: i }));
      q.current = { id: 999 };
      q.future = [{ id: 1000 }];
      q.advance();
      expect(q.past.length).toBe(200);
    });
  });

  describe('peek', () => {
    it('returns first future song', () => {
      const q = new SongQueue();
      q.future = [{ id: 1 }, { id: 2 }];
      expect(q.peek().id).toBe(1);
    });

    it('returns null when future empty', () => {
      const q = new SongQueue();
      expect(q.peek()).toBeNull();
    });
  });

  describe('goBack', () => {
    it('moves current to front of future and past[-1] to current', () => {
      const q = new SongQueue();
      q.past = [{ id: 1 }];
      q.current = { id: 2 };
      const prev = q.goBack();
      expect(prev.id).toBe(1);
      expect(q.current.id).toBe(1);
      expect(q.future[0].id).toBe(2);
      expect(q.past).toHaveLength(0);
    });

    it('returns null when past is empty', () => {
      const q = new SongQueue();
      expect(q.goBack()).toBeNull();
    });
  });

  describe('clear', () => {
    it('resets past/current/future', () => {
      const q = new SongQueue();
      q.past = [{ id: 1 }];
      q.current = { id: 2 };
      q.future = [{ id: 3 }];
      q.clear();
      expect(q.past).toEqual([]);
      expect(q.current).toBeNull();
      expect(q.future).toEqual([]);
    });
  });

  describe('shuffle', () => {
    it('shuffles future array', () => {
      const q = new SongQueue();
      q.future = Array.from({ length: 50 }, (_, i) => ({ id: i }));
      q.shuffle();
      const ids = q.future.map(s => s.id);
      expect(ids).not.toEqual(Array.from({ length: 50 }, (_, i) => i));
    });
  });

  describe('removeFromFuture', () => {
    it('removes matching song by id', () => {
      const q = new SongQueue();
      q.future = [{ id: 1 }, { id: 2 }, { id: 3 }];
      q.removeFromFuture(2);
      expect(q.future).toHaveLength(2);
      expect(q.future.map(s => s.id)).toEqual([1, 3]);
    });

    it('removes matching song by song_id', () => {
      const q = new SongQueue();
      q.future = [{ song_id: 10 }, { id: 20 }];
      q.removeFromFuture(10);
      expect(q.future).toHaveLength(1);
      expect(q.future[0].id).toBe(20);
    });
  });

  describe('needsMore', () => {
    it('returns true when future below threshold', () => {
      const q = new SongQueue();
      q.future = [{ id: 1 }, { id: 2 }];
      expect(q.needsMore(5)).toBe(true);
    });

    it('returns false when future at or above threshold', () => {
      const q = new SongQueue();
      q.future = Array.from({ length: 5 }, (_, i) => ({ id: i }));
      expect(q.needsMore(5)).toBe(false);
    });

    it('defaults threshold to 5', () => {
      const q = new SongQueue();
      q.future = Array.from({ length: 4 }, (_, i) => ({ id: i }));
      expect(q.needsMore()).toBe(true);
    });
  });

  describe('setMode', () => {
    it('shuffles when switching to shuffle', () => {
      const q = new SongQueue();
      q.mode = 'sequential';
      q.future = Array.from({ length: 20 }, (_, i) => ({ id: i }));
      q.setMode('shuffle');
      expect(q.mode).toBe('shuffle');
      const ids = q.future.map(s => s.id);
      expect(ids).not.toEqual(Array.from({ length: 20 }, (_, i) => i));
    });

    it('does NOT shuffle when already shuffle', () => {
      const q = new SongQueue();
      q.future = [{ id: 1 }, { id: 2 }, { id: 3 }];
      q.setMode('shuffle');
      expect(q.future.map(s => s.id)).toEqual([1, 2, 3]);
    });
  });

  describe('toState / loadFromState', () => {
    it('serializes to plain object', () => {
      const q = new SongQueue();
      q.past = [{ id: 1 }];
      q.current = { id: 2 };
      q.future = [{ id: 3 }];
      q.mode = 'sequential';
      q.stateVersion = 5;
      const state = q.toState();
      expect(state.past).toEqual([{ id: 1 }]);
      expect(state.current).toEqual({ id: 2 });
      expect(state.future).toEqual([{ id: 3 }]);
      expect(state.mode).toBe('sequential');
      expect(state.version).toBe(5);
    });

    it('trims past to 50 and future to 100 in toState', () => {
      const q = new SongQueue();
      q.past = Array.from({ length: 100 }, (_, i) => ({ id: i }));
      q.future = Array.from({ length: 200 }, (_, i) => ({ id: i }));
      const state = q.toState();
      expect(state.past).toHaveLength(50);
      expect(state.future).toHaveLength(100);
    });

    it('loads from object state', () => {
      const q = new SongQueue();
      q.loadFromState({ past: [{ id: 1 }], current: { id: 2 }, future: [{ id: 3 }], mode: 'fm', version: 7 });
      expect(q.past).toEqual([{ id: 1 }]);
      expect(q.current).toEqual({ id: 2 });
      expect(q.future).toEqual([{ id: 3 }]);
      expect(q.mode).toBe('fm');
      expect(q.stateVersion).toBe(7);
    });

    it('loads from JSON string', () => {
      const q = new SongQueue();
      q.loadFromState('{"past":[],"current":null,"future":[],"mode":"sequential","version":3}');
      expect(q.mode).toBe('sequential');
      expect(q.stateVersion).toBe(3);
    });

    it('handles null state gracefully', () => {
      const q = new SongQueue();
      q.loadFromState(null);
      expect(q.past).toEqual([]);
      expect(q.current).toBeNull();
    });

    it('handles invalid JSON gracefully', () => {
      const q = new SongQueue();
      q.loadFromState('not json');
      expect(q.past).toEqual([]);
    });
  });
});
