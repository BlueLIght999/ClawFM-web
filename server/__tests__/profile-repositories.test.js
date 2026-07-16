import { describe, it, expect, vi } from 'vitest';
import { createLegacyProfileSnapshotRepository } from '../infrastructure/persistence/repositories/LegacyProfileSnapshotRepository.js';
import { createLegacyProfileCollectionStateRepository } from '../infrastructure/persistence/repositories/LegacyProfileCollectionStateRepository.js';
import { createLegacyStyleTagCacheRepository } from '../infrastructure/persistence/repositories/LegacyStyleTagCacheRepository.js';
import { createLegacyClusterResultRepository } from '../infrastructure/persistence/repositories/LegacyClusterResultRepository.js';

// ── ProfileSnapshotRepository ──────────────────────────

describe('ProfileSnapshotRepository adapter', () => {
  it('save_serializesProfileToJson', () => {
    const saveProfileSnapshot = vi.fn();
    const repo = createLegacyProfileSnapshotRepository({
      saveProfileSnapshot,
      getProfileSnapshots: () => [],
      getLatestProfileSnapshot: () => null,
    });

    repo.save({ tags: { genre: { pop: 0.8 } } }, 1);

    expect(saveProfileSnapshot).toHaveBeenCalledWith(
      JSON.stringify({ tags: { genre: { pop: 0.8 } } }),
      1,
    );
  });

  it('recent_mapsLegacyRowsToDomainSnapshots', () => {
    const repo = createLegacyProfileSnapshotRepository({
      saveProfileSnapshot: vi.fn(),
      getProfileSnapshots: () => [
        {
          id: 5,
          snapshot_json: '{"tags":{"genre":{"rock":0.6}}}',
          schema_version: 2,
          created_at: '2026-07-14T10:00:00.000Z',
        },
      ],
      getLatestProfileSnapshot: () => null,
    });

    const result = repo.recent(10);

    expect(result).toEqual([
      {
        id: 5,
        profile: { tags: { genre: { rock: 0.6 } } },
        schemaVersion: 2,
        createdAt: '2026-07-14T10:00:00.000Z',
      },
    ]);
  });

  it('latest_whenLegacyEmpty_returnsNull', () => {
    const repo = createLegacyProfileSnapshotRepository({
      saveProfileSnapshot: vi.fn(),
      getProfileSnapshots: () => [],
      getLatestProfileSnapshot: () => null,
    });

    expect(repo.latest()).toBeNull();
  });

  it('latest_mapsLegacyRowToDomainSnapshot', () => {
    const repo = createLegacyProfileSnapshotRepository({
      saveProfileSnapshot: vi.fn(),
      getProfileSnapshots: () => [],
      getLatestProfileSnapshot: () => ({
        id: 9,
        snapshot_json: '{"version":3}',
        schema_version: 3,
        created_at: '2026-07-14T12:00:00.000Z',
      }),
    });

    expect(repo.latest()).toEqual({
      id: 9,
      profile: { version: 3 },
      schemaVersion: 3,
      createdAt: '2026-07-14T12:00:00.000Z',
    });
  });

  it('recent_whenLegacyReturnsNull_returnsEmptyArray', () => {
    const repo = createLegacyProfileSnapshotRepository({
      saveProfileSnapshot: vi.fn(),
      getProfileSnapshots: () => null,
      getLatestProfileSnapshot: () => null,
    });

    expect(repo.recent(5)).toEqual([]);
  });
});

// ── ProfileCollectionStateRepository ────────────────────

describe('ProfileCollectionStateRepository adapter', () => {
  it('get_whenLegacyEmpty_returnsNull', () => {
    const repo = createLegacyProfileCollectionStateRepository({
      getCollectionState: () => null,
      upsertCollectionState: vi.fn(),
      getAllCollectionStates: () => [],
    });

    expect(repo.get('recentlyPlayed')).toBeNull();
  });

  it('get_mapsLegacyRowToDomainState', () => {
    const repo = createLegacyProfileCollectionStateRepository({
      getCollectionState: () => ({
        collector_name: 'recentlyPlayed',
        last_run_at: '2026-07-14T08:00:00.000Z',
        is_first_run: 0,
        run_count: 3,
        state_json: '{"cursor":"abc"}',
      }),
      upsertCollectionState: vi.fn(),
      getAllCollectionStates: () => [],
    });

    expect(repo.get('recentlyPlayed')).toEqual({
      collectorName: 'recentlyPlayed',
      lastRunAt: '2026-07-14T08:00:00.000Z',
      isFirstRun: 0,
      runCount: 3,
      state: { cursor: 'abc' },
    });
  });

  it('upsert_serializesStateToJson', () => {
    const upsertCollectionState = vi.fn();
    const repo = createLegacyProfileCollectionStateRepository({
      getCollectionState: () => null,
      upsertCollectionState,
      getAllCollectionStates: () => [],
    });

    repo.upsert('recentlyPlayed', {
      lastRunAt: '2026-07-14T09:00:00.000Z',
      isFirstRun: false,
      runCount: 2,
      state: { cursor: 'xyz' },
    });

    expect(upsertCollectionState).toHaveBeenCalledWith('recentlyPlayed', {
      lastRunAt: '2026-07-14T09:00:00.000Z',
      isFirstRun: false,
      runCount: 2,
      stateJson: JSON.stringify({ cursor: 'xyz' }),
    });
  });

  it('getAll_mapsLegacyRowsToDomainStates', () => {
    const repo = createLegacyProfileCollectionStateRepository({
      getCollectionState: () => null,
      upsertCollectionState: vi.fn(),
      getAllCollectionStates: () => [
        {
          collector_name: 'topArtists',
          last_run_at: '2026-07-14T01:00:00.000Z',
          is_first_run: 1,
          run_count: 0,
          state_json: null,
        },
      ],
    });

    const result = repo.getAll();

    expect(result).toEqual([
      {
        collectorName: 'topArtists',
        lastRunAt: '2026-07-14T01:00:00.000Z',
        isFirstRun: 1,
        runCount: 0,
        state: null,
      },
    ]);
  });

  it('upsert_whenStateIsNull_passesNullJson', () => {
    const upsertCollectionState = vi.fn();
    const repo = createLegacyProfileCollectionStateRepository({
      getCollectionState: () => null,
      upsertCollectionState,
      getAllCollectionStates: () => [],
    });

    repo.upsert('topArtists', {
      lastRunAt: null,
      isFirstRun: true,
      runCount: 0,
      state: null,
    });

    expect(upsertCollectionState).toHaveBeenCalledWith('topArtists', {
      lastRunAt: null,
      isFirstRun: true,
      runCount: 0,
      stateJson: null,
    });
  });
});

// ── StyleTagCacheRepository ─────────────────────────────

describe('StyleTagCacheRepository adapter', () => {
  it('upsertTag_serializesRawToJson', () => {
    const upsertStyleTag = vi.fn();
    const repo = createLegacyStyleTagCacheRepository({
      upsertStyleTag,
      getAllStyleTags: () => [],
      getStyleTagsByCategory: () => [],
      upsertSongStyleMapping: vi.fn(),
      getSongStyleMappings: () => [],
      getAllSongStyleMappings: () => [],
    });

    repo.upsertTag({ tagId: 'pop', tagName: 'Pop', category: 'genre', raw: { weight: 0.9 } });

    expect(upsertStyleTag).toHaveBeenCalledWith({
      tagId: 'pop',
      tagName: 'Pop',
      category: 'genre',
      rawJson: JSON.stringify({ weight: 0.9 }),
    });
  });

  it('upsertTag_whenRawIsUndefined_passesNullJson', () => {
    const upsertStyleTag = vi.fn();
    const repo = createLegacyStyleTagCacheRepository({
      upsertStyleTag,
      getAllStyleTags: () => [],
      getStyleTagsByCategory: () => [],
      upsertSongStyleMapping: vi.fn(),
      getSongStyleMappings: () => [],
      getAllSongStyleMappings: () => [],
    });

    repo.upsertTag({ tagId: 'rock', tagName: 'Rock', category: 'genre' });

    expect(upsertStyleTag).toHaveBeenCalledWith({
      tagId: 'rock',
      tagName: 'Rock',
      category: 'genre',
      rawJson: null,
    });
  });

  it('getAllTags_mapsLegacyRowsToDomainTags', () => {
    const repo = createLegacyStyleTagCacheRepository({
      upsertStyleTag: vi.fn(),
      getAllStyleTags: () => [
        {
          tag_id: 'jazz',
          tag_name: 'Jazz',
          category: 'genre',
          raw_json: '{}',
          cached_at: '2026-07-14T03:00:00.000Z',
        },
      ],
      getStyleTagsByCategory: () => [],
      upsertSongStyleMapping: vi.fn(),
      getSongStyleMappings: () => [],
      getAllSongStyleMappings: () => [],
    });

    expect(repo.getAllTags()).toEqual([
      {
        tagId: 'jazz',
        tagName: 'Jazz',
        category: 'genre',
        cachedAt: '2026-07-14T03:00:00.000Z',
      },
    ]);
  });

  it('getTagsByCategory_delegatesCategoryAndMapsRows', () => {
    const getStyleTagsByCategory = vi.fn(() => [
      {
        tag_id: 'energetic',
        tag_name: 'Energetic',
        category: 'mood',
        raw_json: null,
        cached_at: '2026-07-14T04:00:00.000Z',
      },
    ]);
    const repo = createLegacyStyleTagCacheRepository({
      upsertStyleTag: vi.fn(),
      getAllStyleTags: () => [],
      getStyleTagsByCategory,
      upsertSongStyleMapping: vi.fn(),
      getSongStyleMappings: () => [],
      getAllSongStyleMappings: () => [],
    });

    const result = repo.getTagsByCategory('mood');

    expect(getStyleTagsByCategory).toHaveBeenCalledWith('mood');
    expect(result).toEqual([
      {
        tagId: 'energetic',
        tagName: 'Energetic',
        category: 'mood',
        cachedAt: '2026-07-14T04:00:00.000Z',
      },
    ]);
  });

  it('upsertMapping_delegatesCamelCaseFields', () => {
    const upsertSongStyleMapping = vi.fn();
    const repo = createLegacyStyleTagCacheRepository({
      upsertStyleTag: vi.fn(),
      getAllStyleTags: () => [],
      getStyleTagsByCategory: () => [],
      upsertSongStyleMapping,
      getSongStyleMappings: () => [],
      getAllSongStyleMappings: () => [],
    });

    repo.upsertMapping({
      songId: 's1',
      tagId: 'pop',
      tagName: 'Pop',
      confidence: 0.85,
      source: 'manual',
    });

    expect(upsertSongStyleMapping).toHaveBeenCalledWith({
      songId: 's1',
      tagId: 'pop',
      tagName: 'Pop',
      confidence: 0.85,
      source: 'manual',
    });
  });

  it('getMappings_mapsLegacyRowsToDomainMappings', () => {
    const repo = createLegacyStyleTagCacheRepository({
      upsertStyleTag: vi.fn(),
      getAllStyleTags: () => [],
      getStyleTagsByCategory: () => [],
      upsertSongStyleMapping: vi.fn(),
      getSongStyleMappings: () => [
        {
          song_id: 's2',
          tag_id: 'rock',
          tag_name: 'Rock',
          confidence: 0.6,
          source: 'inferred',
          mapped_at: '2026-07-14T05:00:00.000Z',
        },
      ],
      getAllSongStyleMappings: () => [],
    });

    expect(repo.getMappings('s2')).toEqual([
      {
        songId: 's2',
        tagId: 'rock',
        tagName: 'Rock',
        confidence: 0.6,
        source: 'inferred',
        mappedAt: '2026-07-14T05:00:00.000Z',
      },
    ]);
  });

  it('getAllMappings_whenLegacyReturnsNull_returnsEmptyArray', () => {
    const repo = createLegacyStyleTagCacheRepository({
      upsertStyleTag: vi.fn(),
      getAllStyleTags: () => [],
      getStyleTagsByCategory: () => [],
      upsertSongStyleMapping: vi.fn(),
      getSongStyleMappings: () => [],
      getAllSongStyleMappings: () => null,
    });

    expect(repo.getAllMappings(100)).toEqual([]);
  });
});

// ── ClusterResultRepository ────────────────────────────

describe('ClusterResultRepository adapter', () => {
  it('save_serializesFeaturesToJson', () => {
    const saveClusterResult = vi.fn();
    const repo = createLegacyClusterResultRepository({
      saveClusterResult,
      getLatestClusterResults: () => [],
    });

    repo.save({
      clusterId: 'c1',
      clusterLabel: 'Late Night',
      features: { energy: 0.3, valence: 0.2 },
      memberCount: 12,
    });

    expect(saveClusterResult).toHaveBeenCalledWith({
      clusterId: 'c1',
      clusterLabel: 'Late Night',
      featureJson: JSON.stringify({ energy: 0.3, valence: 0.2 }),
      memberCount: 12,
    });
  });

  it('latest_mapsLegacyRowsToDomainResults', () => {
    const repo = createLegacyClusterResultRepository({
      saveClusterResult: vi.fn(),
      getLatestClusterResults: () => [
        {
          id: 1,
          cluster_id: 'c2',
          cluster_label: 'Morning Energy',
          feature_json: '{"energy":0.8}',
          member_count: 5,
          created_at: '2026-07-14T06:00:00.000Z',
        },
      ],
    });

    expect(repo.latest()).toEqual([
      {
        clusterId: 'c2',
        clusterLabel: 'Morning Energy',
        features: { energy: 0.8 },
        memberCount: 5,
        createdAt: '2026-07-14T06:00:00.000Z',
      },
    ]);
  });

  it('latest_whenLegacyReturnsNull_returnsEmptyArray', () => {
    const repo = createLegacyClusterResultRepository({
      saveClusterResult: vi.fn(),
      getLatestClusterResults: () => null,
    });

    expect(repo.latest()).toEqual([]);
  });

  it('save_whenMemberCountUndefined_passesUndefinedToLegacy', () => {
    const saveClusterResult = vi.fn();
    const repo = createLegacyClusterResultRepository({
      saveClusterResult,
      getLatestClusterResults: () => [],
    });

    repo.save({
      clusterId: 'c3',
      clusterLabel: 'Chill',
      features: { acousticness: 0.9 },
    });

    expect(saveClusterResult).toHaveBeenCalledWith({
      clusterId: 'c3',
      clusterLabel: 'Chill',
      featureJson: JSON.stringify({ acousticness: 0.9 }),
      memberCount: undefined,
    });
  });
});
