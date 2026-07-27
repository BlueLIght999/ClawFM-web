import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SearchResultCache } from '../domain/music/SearchResultCache.js';

/**
 * F3: SearchResultCache — domain-level LRU+TTL cache for music search results.
 * Modeled after AudioUrlCache. Reduces external Netease API calls for repeated
 * queries within a 60s window. This is an optimization, NOT a bug fix.
 */
describe('SearchResultCache', () => {
  let mockMusic;
  let cache;

  beforeEach(() => {
    vi.useFakeTimers();
    mockMusic = { search: vi.fn() };
    mockMusic.search.mockImplementation(async (k, l) => [
      { id: `${k}-${l}-1` },
      { id: `${k}-${l}-2` },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sameQueryAndLimit_withinTtl_reusesCachedResult', async () => {
    cache = new SearchResultCache({ music: mockMusic, ttlMs: 60000 });
    const first = await cache.search('周杰伦', 5);
    const second = await cache.search('周杰伦', 5);

    expect(second).toEqual(first);
    expect(mockMusic.search).toHaveBeenCalledTimes(1);
  });

  it('sameQuery_afterTtlExpires_refetchesFromMusic', async () => {
    cache = new SearchResultCache({ music: mockMusic, ttlMs: 60000 });
    await cache.search('周杰伦', 5);
    expect(mockMusic.search).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(61000);

    await cache.search('周杰伦', 5);
    expect(mockMusic.search).toHaveBeenCalledTimes(2);
  });

  it('sameQueryDifferentLimit_cachedSeparately', async () => {
    cache = new SearchResultCache({ music: mockMusic, ttlMs: 60000 });
    await cache.search('周杰伦', 5);
    await cache.search('周杰伦', 10);

    expect(mockMusic.search).toHaveBeenCalledTimes(2);
    expect(mockMusic.search).toHaveBeenNthCalledWith(1, '周杰伦', 5);
    expect(mockMusic.search).toHaveBeenNthCalledWith(2, '周杰伦', 10);
  });

  it('differentQueries_cachedSeparately', async () => {
    cache = new SearchResultCache({ music: mockMusic, ttlMs: 60000 });
    await cache.search('周杰伦', 5);
    await cache.search('林俊杰', 5);

    expect(mockMusic.search).toHaveBeenCalledTimes(2);
  });

  it('lruEviction_whenMaxSizeReached_evictsOldest', async () => {
    cache = new SearchResultCache({ music: mockMusic, ttlMs: 60000, maxSize: 2 });
    await cache.search('q1', 5);
    await cache.search('q2', 5);
    await cache.search('q3', 5); // evicts q1

    expect(cache.size).toBe(2);
    expect(cache.getCached('q1', 5)).toBeNull();
    expect(cache.getCached('q3', 5)).not.toBeNull();
  });

  it('lru_accessRefreshesPosition', async () => {
    cache = new SearchResultCache({ music: mockMusic, ttlMs: 60000, maxSize: 2 });
    await cache.search('q1', 5);
    await cache.search('q2', 5);

    cache.getCached('q1', 5); // access q1, refresh its position

    await cache.search('q3', 5); // should evict q2 (least recently used)
    expect(cache.getCached('q1', 5)).not.toBeNull();
    expect(cache.getCached('q2', 5)).toBeNull();
  });

  it('maxSizeZero_disablesCaching', async () => {
    cache = new SearchResultCache({ music: mockMusic, ttlMs: 60000, maxSize: 0 });
    await cache.search('周杰伦', 5);
    await cache.search('周杰伦', 5);

    expect(mockMusic.search).toHaveBeenCalledTimes(2);
    expect(cache.size).toBe(0);
  });

  it('nonArrayResult_notCached', async () => {
    mockMusic.search.mockResolvedValueOnce(null);
    cache = new SearchResultCache({ music: mockMusic, ttlMs: 60000 });
    const result = await cache.search('empty', 5);

    expect(result).toBeNull();
    expect(cache.size).toBe(0);
  });
});
