import { describe, it, expect, vi } from 'vitest';
import { createLegacyNeteaseMusicSourceAdapter } from '../infrastructure/music/LegacyNeteaseMusicSourceAdapter.js';

describe('MusicSourcePort adapter', () => {
  it('search_mapsNeteaseSongsToStableSongShape', async () => {
    const adapter = createLegacyNeteaseMusicSourceAdapter({
      searchSongs: async () => ({
        result: {
          songs: [{
            id: 1,
            name: '晴天',
            ar: [{ name: '周杰伦' }],
            al: { name: '叶惠美', picUrl: 'http://cover' },
            dt: 269000,
          }],
        },
      }),
    });

    await expect(adapter.search('晴天', 1)).resolves.toEqual([{
      id: '1',
      title: '晴天',
      artist: '周杰伦',
      album: '叶惠美',
      durationMs: 269000,
      coverUrl: 'http://cover',
    }]);
  });

  it('songUrl_whenLegacyReturnsNoUrl_returnsNull', async () => {
    const adapter = createLegacyNeteaseMusicSourceAdapter({
      getSongUrl: async () => ({ data: [{ url: '' }] }),
    });

    await expect(adapter.songUrl('1')).resolves.toBeNull();
  });

  it('scrobble_swallowsLegacyFailure', async () => {
    const adapter = createLegacyNeteaseMusicSourceAdapter({
      scrobbleSong: vi.fn(async () => { throw new Error('offline'); }),
    });

    await expect(adapter.scrobble('1')).resolves.toBeUndefined();
  });

  it('details_mapsLegacySongDetailsToStableSongShape', async () => {
    const adapter = createLegacyNeteaseMusicSourceAdapter({
      getSongDetail: async () => ({
        songs: [{
          id: 1,
          name: '晴天',
          ar: [{ name: '周杰伦' }],
          al: { name: '叶惠美', picUrl: 'http://cover' },
          dt: 269000,
        }],
      }),
    });

    await expect(adapter.details(['1'])).resolves.toEqual([{
      id: '1',
      title: '晴天',
      artist: '周杰伦',
      album: '叶惠美',
      durationMs: 269000,
      coverUrl: 'http://cover',
    }]);
  });

  it('likedSongs_mapsLegacyLikedSongsToStableSongShape', async () => {
    const adapter = createLegacyNeteaseMusicSourceAdapter({
      getLikedSongs: async () => ({
        ids: [{
          id: 2,
          name: '稻香',
          ar: [{ name: '周杰伦' }],
          al: { name: '魔杰座' },
          dt: 223000,
        }],
      }),
    });

    await expect(adapter.likedSongs('u1')).resolves.toEqual([{
      id: '2',
      title: '稻香',
      artist: '周杰伦',
      album: '魔杰座',
      durationMs: 223000,
      coverUrl: '',
    }]);
  });
});
