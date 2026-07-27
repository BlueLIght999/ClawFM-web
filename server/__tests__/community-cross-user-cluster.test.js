import { describe, expect, it } from 'vitest';
import {
  extractFeatureVector,
  generateClusterLabel,
  featureDimensionNames,
} from '../domain/community/clustering/FeatureExtractor.js';
import { crossUserCluster } from '../domain/community/clustering/CrossUserClusterAnalyzer.js';

function makeProfile({ genre = {}, mood = {}, behavior = {}, timeSlot = {}, topArtist, userTags = [] } = {}) {
  return {
    tags: { genre, mood, region: {}, behavior, chat: {} },
    artistAffinity: topArtist ? [{ artist: topArtist, weight: 0.9 }] : [],
    timeSlot,
    userTags: userTags.map((t) => ({ tag: t, weight: 1 })),
    meta: { totalPlays: 0, source: 'P-B' },
  };
}

describe('community feature extractor', () => {
  it('extractFeatureVector_producesAllDimensionsWithNumericValues', () => {
    const v = extractFeatureVector(makeProfile({ genre: { rock: 1 }, timeSlot: { night: 1 }, topArtist: 'X', userTags: ['a', 'b'] }));
    const names = featureDimensionNames();
    for (const n of names) expect(v).toHaveProperty(n);
    expect(Object.keys(v).length).toBe(names.length);
    expect(v.genre_rock).toBe(1);
    expect(v.genre_pop).toBe(0);
    expect(v.ts_night).toBe(1);
    expect(v.artist_top).toBe(0.9);
    expect(v.user_tags_count).toBe(0.2);
  });

  it('extractFeatureVector_handlesEmptyProfile', () => {
    const v = extractFeatureVector({});
    expect(Object.keys(v).length).toBe(featureDimensionNames().length);
    expect(v.genre_rock).toBe(0);
    expect(v.artist_top).toBe(0);
    expect(v.user_tags_count).toBe(0);
  });

  it('extractFeatureVector_handlesNullProfile', () => {
    expect(() => extractFeatureVector(null)).not.toThrow();
    expect(() => extractFeatureVector(undefined)).not.toThrow();
  });

  it('generateClusterLabel_picksTop3NonZeroFeatures', () => {
    const label = generateClusterLabel({ genre_rock: 0.8, mood_happy: 0.2, ts_night: 0.5, genre_pop: 0 });
    expect(label).toBe('rock·night·happy');
  });

  it('generateClusterLabel_returnsUnknownForAllZero', () => {
    expect(generateClusterLabel({ genre_rock: 0, mood_happy: 0 })).toBe('unknown');
    expect(generateClusterLabel({})).toBe('unknown');
    expect(generateClusterLabel(null)).toBe('unknown');
  });

  it('generateClusterLabel_mapsSpecialKeys', () => {
    const label = generateClusterLabel({ artist_top: 0.9, user_tags_count: 0.5, genre_rock: 0.1 });
    expect(label.startsWith('artist')).toBe(true);
  });
});

describe('community cross-user cluster analyzer', () => {
  it('returnsEmptyForNoProfiles', () => {
    const r = crossUserCluster([]);
    expect(r.k).toBe(0);
    expect(r.clusters).toEqual([]);
    expect(r.memberAssignments).toEqual({});
  });

  it('returnsSoloClusterForSingleMember', () => {
    const r = crossUserCluster([{ userId: 'u1', profile: makeProfile({ genre: { rock: 1 } }) }]);
    expect(r.k).toBe(1);
    expect(r.clusters.length).toBe(1);
    expect(r.clusters[0].memberUserIds).toEqual(['u1']);
    expect(r.memberAssignments.u1).toBe(0);
  });

  it('mapsMembersBackToUserIdsUsingMockStrategy', () => {
    const mockStrategy = {
      cluster(vectors) {
        const mid = Math.ceil(vectors.length / 2);
        const clusters = [];
        for (let c = 0; c < 2; c++) {
          const members = vectors.filter((_, i) => (c === 0 ? i < mid : i >= mid));
          clusters.push({ clusterId: c, centroid: members[0] || {}, members, memberCount: members.length });
        }
        return { strategy: 'mock', k: 2, clusters };
      },
    };
    const r = crossUserCluster(
      [
        { userId: 'a', profile: makeProfile({ genre: { rock: 1 } }) },
        { userId: 'b', profile: makeProfile({ genre: { rock: 1 } }) },
        { userId: 'c', profile: makeProfile({ genre: { pop: 1 } }) },
      ],
      { clusterStrategy: mockStrategy }
    );
    expect(r.k).toBe(2);
    expect(r.clusters[0].memberUserIds).toEqual(['a', 'b']);
    expect(r.clusters[1].memberUserIds).toEqual(['c']);
    expect(r.memberAssignments).toEqual({ a: 0, b: 0, c: 1 });
  });

  it('usesRealKMeansAndCoversAllMembers', () => {
    // 3 rock + 3 pop，差异明显，KMeans 应分出 ≤2 簇且全员被分配
    const profiles = [
      ...Array.from({ length: 3 }, (_, i) => ({ userId: `rock${i}`, profile: makeProfile({ genre: { rock: 1 }, mood: { energetic: 1 } }) })),
      ...Array.from({ length: 3 }, (_, i) => ({ userId: `pop${i}`, profile: makeProfile({ genre: { pop: 1 }, mood: { happy: 1 } }) })),
    ];
    const r = crossUserCluster(profiles);
    const assigned = Object.keys(r.memberAssignments);
    expect(assigned.length).toBe(6);
    expect(r.clusters.length).toBeGreaterThanOrEqual(1);
    // 同类应尽量同簇：rock0..2 至少有两个同簇
    const rockClusters = ['rock0', 'rock1', 'rock2'].map((u) => r.memberAssignments[u]);
    const uniq = new Set(rockClusters);
    expect(uniq.size).toBeLessThanOrEqual(2);
  });

  it('filtersOutEntriesWithoutUserId', () => {
    const r = crossUserCluster([{ profile: makeProfile() }, { userId: 'u1', profile: makeProfile() }]);
    expect(Object.keys(r.memberAssignments)).toEqual(['u1']);
  });
});
