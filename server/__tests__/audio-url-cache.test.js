import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudioUrlCache } from '../domain/playback/AudioUrlCache.js';

describe('AudioUrlCache', () => {
  let cache;
  let musicMock;

  beforeEach(() => {
    musicMock = { songUrl: vi.fn() };
    cache = new AudioUrlCache({ music: musicMock, ttlMs: 15 * 60 * 1000 });
  });

  it('returnsNull_forUnknownSong_whenMusicFails', async () => {
    musicMock.songUrl.mockRejectedValue(new Error('fail'));
    const result = await cache.get('123');
    expect(result).toBeNull();
  });

  it('returnsNull_whenMusicReturnsNull', async () => {
    musicMock.songUrl.mockResolvedValue(null);
    const result = await cache.get('123');
    expect(result).toBeNull();
  });

  it('returnsUrl_fromMusic_onFirstCall', async () => {
    musicMock.songUrl.mockResolvedValue('http://audio.mp3');
    const result = await cache.get('123');
    expect(result).toBe('http://audio.mp3');
    expect(musicMock.songUrl).toHaveBeenCalledWith('123');
  });

  it('returnsCachedUrl_onSecondCall_withinTtl', async () => {
    musicMock.songUrl.mockResolvedValue('http://cached.mp3');
    await cache.get('123');
    musicMock.songUrl.mockClear();
    const result = await cache.get('123');
    expect(result).toBe('http://cached.mp3');
    expect(musicMock.songUrl).not.toHaveBeenCalled();
  });

  it('refetches_whenCacheExpires', async () => {
    const shortTtl = new AudioUrlCache({ music: musicMock, ttlMs: 10 });
    musicMock.songUrl.mockResolvedValue('http://first.mp3');
    await shortTtl.get('123');
    await new Promise(r => setTimeout(r, 20));
    musicMock.songUrl.mockResolvedValue('http://second.mp3');
    const result = await shortTtl.get('123');
    expect(result).toBe('http://second.mp3');
    expect(musicMock.songUrl).toHaveBeenCalledTimes(2);
  });

  it('acceptsSongObject_extractsId', async () => {
    musicMock.songUrl.mockResolvedValue('http://audio.mp3');
    await cache.get({ id: '456', ar: [{ name: 'X' }] });
    expect(musicMock.songUrl).toHaveBeenCalledWith('456');
  });

  it('getCachedUrl_returnsUrl_withoutFetching', () => {
    cache._cache.set('123', { url: 'http://cached.mp3', expires: Date.now() + 999999 });
    expect(cache.getCachedUrl('123')).toBe('http://cached.mp3');
  });

  it('getCachedUrl_returnsNull_whenNotCached', () => {
    expect(cache.getCachedUrl('999')).toBeNull();
  });

  it('getCachedUrl_returnsNull_whenExpired', () => {
    cache._cache.set('123', { url: 'http://old.mp3', expires: Date.now() - 1 });
    expect(cache.getCachedUrl('123')).toBeNull();
  });

  it('clear_removesAllEntries', async () => {
    musicMock.songUrl.mockResolvedValue('http://audio.mp3');
    await cache.get('123');
    cache.clear();
    expect(cache.getCachedUrl('123')).toBeNull();
  });
});
