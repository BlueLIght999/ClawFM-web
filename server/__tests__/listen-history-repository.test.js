import { describe, it, expect, vi } from 'vitest';
import { createLegacyListenHistoryRepository } from '../infrastructure/persistence/repositories/LegacyListenHistoryRepository.js';

describe('ListenHistoryRepository adapter', () => {
  it('record_mapsCamelCasePlayRecordToLegacyShape', () => {
    const recordListen = vi.fn();
    const repo = createLegacyListenHistoryRepository({
      recordListen,
      getRecentSongIds: () => [],
      getArtistPlayCount: () => [],
      getListenHistory: () => [],
    });

    repo.record({
      songId: '123',
      title: 'Song',
      artist: 'Artist',
      album: 'Album',
      durationSec: 240,
      source: 'queue',
    });

    expect(recordListen).toHaveBeenCalledWith({
      song_id: '123',
      title: 'Song',
      artist: 'Artist',
      album: 'Album',
      duration: 240,
      source: 'queue',
    });
  });

  it('recentSongIds_whenLegacyEmpty_returnsEmptyArray', () => {
    const repo = createLegacyListenHistoryRepository({
      recordListen: vi.fn(),
      getRecentSongIds: () => null,
      getArtistPlayCount: () => null,
      getListenHistory: () => null,
    });

    expect(repo.recentSongIds(20)).toEqual([]);
    expect(repo.artistPlayCount(1)).toEqual([]);
    expect(repo.history(5)).toEqual([]);
  });
});
