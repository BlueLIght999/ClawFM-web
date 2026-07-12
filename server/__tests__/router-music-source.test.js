import { describe, it, expect, vi } from 'vitest';

vi.mock('../services/claude.js', () => ({
  extractIntent: vi.fn(),
}));

vi.mock('../infrastructure/netease/neteaseApi.js', () => ({
  searchSongs: vi.fn(async () => ({ result: { songs: [] } })),
  getSongUrl: vi.fn(async () => ({ data: [{ url: null }] })),
  getLyric: vi.fn(async () => ({})),
  getSimilarSongs: vi.fn(async () => ({ songs: [] })),
  getPersonalFm: vi.fn(async () => ({ data: [] })),
  getRecommendSongs: vi.fn(async () => ({ data: { dailySongs: [] } })),
  getSongDetail: vi.fn(async () => ({ songs: [] })),
  getLikedSongs: vi.fn(async () => ({ ids: [] })),
  getUserPlaylists: vi.fn(async () => ({ playlist: [] })),
  getPlaylistTracks: vi.fn(async () => ({ songs: [] })),
  scrobbleSong: vi.fn(async () => {}),
}));

const { routeIntent } = await import('../services/router.js');
const { extractIntent } = await import('../services/claude.js');

describe('routeIntent MusicSourcePort seam', () => {
  it('playPrefix_songName_searchesViaInjectedMusicSourcePort', async () => {
    const music = {
      search: vi.fn(async () => [{
        id: '186016',
        title: 'Sunny Day',
        artist: 'Jay',
        album: 'Leaf',
        durationMs: 269000,
      }]),
    };

    const result = await routeIntent('play Sunny Day', { music });

    expect(result.route).toBe('ncm');
    expect(result.action).toBe('play_search');
    expect(result.results).toEqual([{
      id: '186016',
      title: 'Sunny Day',
      artist: 'Jay',
      album: 'Leaf',
      durationMs: 269000,
    }]);
    expect(music.search).toHaveBeenCalledWith('sunny day', 5);
    expect(extractIntent).not.toHaveBeenCalled();
  });

  it('playMood_searchesViaInjectedMusicSourcePort', async () => {
    extractIntent.mockResolvedValue({ action: 'play_mood', params: { mood: 'happy' } });
    const music = {
      search: vi.fn(async () => [{
        id: '1',
        title: 'Bright',
        artist: 'DJ',
        album: '',
        durationMs: 180000,
      }]),
    };

    const result = await routeIntent('make me happy', { music });

    expect(result.route).toBe('hybrid');
    expect(result.action).toBe('play_mood');
    expect(result.results).toHaveLength(1);
    expect(music.search).toHaveBeenCalledWith('欢快 流行', 5);
  });
});
