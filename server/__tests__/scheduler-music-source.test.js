import { describe, it, expect, vi } from 'vitest';

vi.mock('../infrastructure/netease/neteaseApi.js', () => ({
  searchSongs: vi.fn(async () => ({ result: { songs: [] } })),
  getSongUrl: vi.fn(async () => ({ data: [{ url: null }] })),
  getLyric: vi.fn(async () => ({})),
  getSimilarSongs: vi.fn(async () => ({ songs: [] })),
  getPersonalFm: vi.fn(async () => ({ data: [] })),
  getRecommendSongs: vi.fn(async () => ({ data: { dailySongs: [] } })),
  getLikedSongs: vi.fn(async () => ({ ids: [] })),
  getUserPlaylists: vi.fn(async () => ({ playlist: [] })),
  getPlaylistTracks: vi.fn(async () => ({ songs: [] })),
  getSongDetail: vi.fn(),
  scrobbleSong: vi.fn(async () => {}),
  getArtistDetail: vi.fn(),
  getArtistDesc: vi.fn(),
  getArtistSongs: vi.fn(),
  getStyleList: vi.fn(),
  getStyleSongs: vi.fn(),
  getStyleArtists: vi.fn(),
  getSongWikiSummary: vi.fn(),
  getSongCreators: vi.fn(),
  getSimilarArtists: vi.fn(),
  getPlaymodeIntelligenceList: vi.fn(),
  getRecommendResource: vi.fn(),
  getPersonalized: vi.fn(),
  getSearchSuggest: vi.fn(),
  getSearchHotDetail: vi.fn(),
  getPlaylistCatlist: vi.fn(),
  getPlaylistHot: vi.fn(),
}));

const { RadioScheduler } = await import('../services/scheduler.js');

describe('RadioScheduler MusicSourcePort seam', () => {
  it('getAudioUrl_usesInjectedMusicSourcePort', async () => {
    const music = {
      songUrl: vi.fn(async () => 'http://audio.local/song.mp3'),
      scrobble: vi.fn(async () => {}),
    };
    const scheduler = new RadioScheduler({ music });

    const url = await scheduler.getAudioUrl({ id: 186016 });

    expect(url).toBe('http://audio.local/song.mp3');
    expect(music.songUrl).toHaveBeenCalledWith('186016');
  });

  it('startSong_scrobblesViaInjectedMusicSourcePort', async () => {
    const music = {
      songUrl: vi.fn(async () => null),
      scrobble: vi.fn(async () => {}),
    };
    const scheduler = new RadioScheduler({ music });

    await scheduler._startSong({ id: 186016, title: 'Sunny Day', durationMs: 1000 });

    expect(music.scrobble).toHaveBeenCalledWith('186016');
    scheduler.destroy();
  });

  it('startSong_usesStableDurationMsForPlayheadDuration', async () => {
    const music = {
      songUrl: vi.fn(async () => null),
      scrobble: vi.fn(async () => {}),
    };
    const scheduler = new RadioScheduler({ music });

    await scheduler._startSong({ id: 186016, title: 'Stable Song', durationMs: 181000 });

    expect(scheduler.playhead.songDuration).toBe(181000);
    scheduler.destroy();
  });
});
