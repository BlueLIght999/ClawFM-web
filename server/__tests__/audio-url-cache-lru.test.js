import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioUrlCache } from '../domain/playback/AudioUrlCache.js';

describe('H5: AudioUrlCache maxSize + LRU eviction', () => {
  let cache;
  let mockMusic;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockMusic = { songUrl: vi.fn() };
    mockMusic.songUrl.mockImplementation(async (id) => `http://${id}.mp3`);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('evicts oldest entries when maxSize is reached', async () => {
    cache = new AudioUrlCache({ music: mockMusic, ttlMs: 60000, maxSize: 3 });
    await cache.get('s1');
    await cache.get('s2');
    await cache.get('s3');
    expect(cache.size).toBe(3);

    // Adding a 4th should evict the oldest (s1)
    await cache.get('s4');
    expect(cache.size).toBe(3);
    expect(cache.getCachedUrl('s1')).toBeNull();
    expect(cache.getCachedUrl('s4')).toBe('http://s4.mp3');
  });

  it('does not evict when below maxSize', async () => {
    cache = new AudioUrlCache({ music: mockMusic, ttlMs: 60000, maxSize: 10 });
    await cache.get('s1');
    await cache.get('s2');
    expect(cache.size).toBe(2);
    expect(cache.getCachedUrl('s1')).toBe('http://s1.mp3');
  });

  it('refreshes LRU position on access', async () => {
    cache = new AudioUrlCache({ music: mockMusic, ttlMs: 60000, maxSize: 3 });
    await cache.get('s1');
    await cache.get('s2');
    await cache.get('s3');

    // Access s1 to refresh its position
    cache.getCachedUrl('s1');

    // Adding s4 should now evict s2 (least recently used)
    await cache.get('s4');
    expect(cache.getCachedUrl('s1')).toBe('http://s1.mp3');
    expect(cache.getCachedUrl('s2')).toBeNull();
  });

  it('default maxSize is 500', () => {
    cache = new AudioUrlCache({ music: mockMusic });
    expect(cache.maxSize).toBe(500);
  });

  it('handles maxSize of 0 (no caching)', async () => {
    cache = new AudioUrlCache({ music: mockMusic, ttlMs: 60000, maxSize: 0 });
    await cache.get('s1');
    expect(cache.size).toBe(0);
    // Still returns the URL from music source
    expect(cache.getCachedUrl('s1')).toBeNull();
  });
});
