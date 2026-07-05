import { describe, it, expect, vi } from 'vitest';
import { createLegacyListenerProfileRepository } from '../infrastructure/persistence/repositories/LegacyListenerProfileRepository.js';
import { createLegacySeedPoolRepository } from '../infrastructure/persistence/repositories/LegacySeedPoolRepository.js';
import { createLegacyChatHistoryRepository } from '../infrastructure/persistence/repositories/LegacyChatHistoryRepository.js';
import { createLegacyPlanRepository } from '../infrastructure/persistence/repositories/LegacyPlanRepository.js';

describe('ListenerProfileRepository adapter', () => {
  it('get_whenLegacyEmpty_returnsEmptyProfile', () => {
    const repo = createLegacyListenerProfileRepository({
      getUserProfile: () => null,
      setUserProfile: vi.fn(),
    });

    expect(repo.get()).toEqual({});
  });

  it('set_delegatesKeyAndValue', () => {
    const setUserProfile = vi.fn();
    const repo = createLegacyListenerProfileRepository({
      getUserProfile: () => ({}),
      setUserProfile,
    });

    repo.set('topArtists', [{ name: 'Artist', count: 2 }]);

    expect(setUserProfile).toHaveBeenCalledWith('topArtists', [{ name: 'Artist', count: 2 }]);
  });
});

describe('SeedPoolRepository adapter', () => {
  it('all_mapsLegacyRowsToCamelCaseSeedSongs', () => {
    const repo = createLegacySeedPoolRepository({
      getSeedPool: () => [{
        song_id: '1',
        title: 'Song',
        artist: 'Artist',
        album: 'Album',
        duration: 300000,
        source: 'liked',
        genre_tags: '["pop"]',
        play_count: 4,
      }],
      upsertSeedPool: vi.fn(),
      incrementPlayCount: vi.fn(),
    });

    expect(repo.all(10)).toEqual([{
      songId: '1',
      title: 'Song',
      artist: 'Artist',
      album: 'Album',
      durationMs: 300000,
      source: 'liked',
      genreTags: ['pop'],
      playCount: 4,
    }]);
  });

  it('upsert_mapsCamelCaseSeedSongToLegacyShape', () => {
    const upsertSeedPool = vi.fn();
    const repo = createLegacySeedPoolRepository({
      getSeedPool: () => [],
      upsertSeedPool,
      incrementPlayCount: vi.fn(),
    });

    repo.upsert({
      songId: '1',
      title: 'Song',
      artist: 'Artist',
      album: 'Album',
      durationMs: 300000,
      source: 'liked',
      genreTags: ['pop'],
      playCount: 0,
    });

    expect(upsertSeedPool).toHaveBeenCalledWith({
      song_id: '1',
      title: 'Song',
      artist: 'Artist',
      album: 'Album',
      duration: 300000,
      source: 'liked',
      genre_tags: '["pop"]',
    });
  });
});

describe('ChatHistoryRepository adapter', () => {
  it('recent_whenLegacyEmpty_returnsEmptyArray', () => {
    const repo = createLegacyChatHistoryRepository({
      getChatHistory: () => null,
      saveChatMessage: vi.fn(),
    });

    expect(repo.recent(5)).toEqual([]);
  });

  it('append_delegatesRoleAndContent', () => {
    const saveChatMessage = vi.fn();
    const repo = createLegacyChatHistoryRepository({
      getChatHistory: () => [],
      saveChatMessage,
    });

    repo.append('assistant', 'hello');

    expect(saveChatMessage).toHaveBeenCalledWith('assistant', 'hello');
  });
});

describe('PlanRepository adapter', () => {
  it('latest_whenLegacyEmpty_returnsNull', () => {
    const repo = createLegacyPlanRepository({
      getPlan: () => null,
      savePlan: vi.fn(),
    });

    expect(repo.latest()).toBeNull();
  });

  it('save_hidesLegacyJsonSerialization', () => {
    const savePlan = vi.fn();
    const repo = createLegacyPlanRepository({
      getPlan: () => null,
      savePlan,
    });
    const plan = { planId: 'p1', mood: 'night', blocks: [] };

    repo.save(plan, 'night');

    expect(savePlan).toHaveBeenCalledWith(JSON.stringify(plan), 'night');
  });
});
