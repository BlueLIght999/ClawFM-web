import { describe, it, expect } from 'vitest';
import { buildListenHistoryRecord } from '../domain/playback/listenHistoryRecord.js';

describe('listen history record rules', () => {
  it('buildListenHistoryRecord_legacyNeteaseSong_returnsRepositoryPayload', () => {
    const record = buildListenHistoryRecord({
      song: {
        id: 186016,
        name: '晴天',
        ar: [{ name: '周杰伦' }],
        al: { name: '叶惠美' },
      },
      durationMs: 269999,
    });

    expect(record).toEqual({
      songId: '186016',
      title: '晴天',
      artist: '周杰伦',
      album: '叶惠美',
      durationSec: 269,
      source: 'queue',
    });
  });

  it('buildListenHistoryRecord_stableSong_returnsRepositoryPayload', () => {
    const record = buildListenHistoryRecord({
      song: {
        song_id: 'song-42',
        title: 'Night Drive',
        artist: 'The Keys',
        album: 'Late Tape',
      },
      durationMs: 180000,
      source: 'fm',
    });

    expect(record).toEqual({
      songId: 'song-42',
      title: 'Night Drive',
      artist: 'The Keys',
      album: 'Late Tape',
      durationSec: 180,
      source: 'fm',
    });
  });

  it('buildListenHistoryRecord_missingSong_returnsNull', () => {
    expect(buildListenHistoryRecord({ song: null, durationMs: 0 })).toBeNull();
  });
});
