import { describe, it, expect, vi } from 'vitest';
import { createLegacyNeteaseMusicSourceAdapter } from '../infrastructure/music/LegacyNeteaseMusicSourceAdapter.js';

describe('P0: likedSongs adapter — /likelist returns ID array, not song objects', () => {
  it('fetches song details when /likelist returns numeric ID array', async () => {
    // Real Netease API: /likelist returns { ids: [123, 456, ...], code: 200 }
    const getLikedSongs = vi.fn(async () => ({ ids: [123, 456], code: 200 }));
    const getSongDetail = vi.fn(async () => ({
      songs: [
        { id: 123, name: 'Jazz Track', ar: [{ name: 'toe' }], al: { name: 'The Book' }, dt: 300000 },
        { id: 456, name: 'Math Rock', ar: [{ name: 'Tricot' }], al: { name: 'T Z P' }, dt: 240000 },
      ],
    }));

    const adapter = createLegacyNeteaseMusicSourceAdapter({ getLikedSongs, getSongDetail });
    const songs = await adapter.likedSongs('user123');

    expect(getLikedSongs).toHaveBeenCalledWith('user123');
    expect(getSongDetail).toHaveBeenCalledWith('123,456');
    expect(songs).toHaveLength(2);
    expect(songs[0]).toMatchObject({ id: '123', title: 'Jazz Track', artist: 'toe' });
    expect(songs[1]).toMatchObject({ id: '456', title: 'Math Rock', artist: 'Tricot' });
  });

  it('returns empty array when /likelist returns empty ids', async () => {
    const getLikedSongs = vi.fn(async () => ({ ids: [], code: 200 }));
    const getSongDetail = vi.fn();

    const adapter = createLegacyNeteaseMusicSourceAdapter({ getLikedSongs, getSongDetail });
    const songs = await adapter.likedSongs('user123');

    expect(songs).toEqual([]);
    expect(getSongDetail).not.toHaveBeenCalled();
  });

  it('limits batch to 500 songs to avoid oversized requests', async () => {
    const ids = Array.from({ length: 600 }, (_, i) => 1000 + i);
    const getLikedSongs = vi.fn(async () => ({ ids, code: 200 }));
    const getSongDetail = vi.fn(async () => ({ songs: [] }));

    const adapter = createLegacyNeteaseMusicSourceAdapter({ getLikedSongs, getSongDetail });
    await adapter.likedSongs('user123');

    // Should only pass first 500 IDs
    const calledIds = getSongDetail.mock.calls[0][0];
    const idCount = calledIds.split(',').length;
    expect(idCount).toBe(500);
  });

  it('handles null/undefined ids gracefully', async () => {
    const getLikedSongs = vi.fn(async () => ({ code: 200 }));
    const getSongDetail = vi.fn();

    const adapter = createLegacyNeteaseMusicSourceAdapter({ getLikedSongs, getSongDetail });
    const songs = await adapter.likedSongs('user123');

    expect(songs).toEqual([]);
    expect(getSongDetail).not.toHaveBeenCalled();
  });

  it('backward compat: handles object array shape (old test mock)', async () => {
    // Some test mocks use object arrays in ids — handle gracefully without getSongDetail
    const getLikedSongs = vi.fn(async () => ({
      ids: [{ id: 2, name: '稻香', ar: [{ name: '周杰伦' }], al: { name: '魔杰座' }, dt: 223000 }],
    }));
    const getSongDetail = vi.fn();

    const adapter = createLegacyNeteaseMusicSourceAdapter({ getLikedSongs, getSongDetail });
    const songs = await adapter.likedSongs('u1');

    expect(songs).toHaveLength(1);
    expect(songs[0]).toMatchObject({ id: '2', title: '稻香', artist: '周杰伦' });
    // Should NOT call getSongDetail since ids are already objects
    expect(getSongDetail).not.toHaveBeenCalled();
  });
});
