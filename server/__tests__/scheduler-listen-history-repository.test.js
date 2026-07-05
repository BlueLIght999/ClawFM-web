import { beforeEach, describe, it, expect, vi } from 'vitest';

vi.mock('../services/netease.js', () => ({
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
}));

const { RadioScheduler } = await import('../services/scheduler.js');
const { queue } = await import('../services/queue.js');

function createDeps() {
  return {
    music: {
      songUrl: vi.fn(async () => null),
      scrobble: vi.fn(async () => {}),
    },
    listenHistory: {
      record: vi.fn(),
    },
  };
}

function setCurrentSong(scheduler) {
  scheduler.playhead.currentSong = {
    id: 186016,
    name: '晴天',
    ar: [{ name: '周杰伦' }],
    al: { name: '叶惠美' },
  };
  scheduler.playhead.songDuration = 269000;
}

describe('RadioScheduler ListenHistoryRepository injection', () => {
  beforeEach(() => {
    queue.past = [];
    queue.current = null;
    queue.future = [];
  });

  it('skip_recordsCurrentSongViaInjectedListenHistoryRepository', async () => {
    const deps = createDeps();
    const scheduler = new RadioScheduler(deps);
    setCurrentSong(scheduler);

    await scheduler.skip();

    expect(deps.listenHistory.record).toHaveBeenCalledWith({
      songId: '186016',
      title: '晴天',
      artist: '周杰伦',
      album: '叶惠美',
      durationSec: 269,
      source: 'queue',
    });
    scheduler.destroy();
  });

  it('onSongEnding_recordsCurrentSongViaInjectedListenHistoryRepository', () => {
    const deps = createDeps();
    const scheduler = new RadioScheduler(deps);
    setCurrentSong(scheduler);
    queue.future = [{ id: 'next', title: 'Next', durationMs: 180000 }];
    scheduler.onDjSpeechNeeded = vi.fn();

    scheduler._onSongEnding();

    expect(deps.listenHistory.record).toHaveBeenCalledWith({
      songId: '186016',
      title: '晴天',
      artist: '周杰伦',
      album: '叶惠美',
      durationSec: 269,
      source: 'queue',
    });
    scheduler.destroy();
  });
});
