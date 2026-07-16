import { describe, it, expect, vi } from 'vitest';

import { BaseAnalyzer } from '../domain/profile/analyzers/BaseAnalyzer.js';
import {
  ClusterStrategy,
  KMeansClusterStrategy,
  DBSCANClusterStrategy,
} from '../domain/profile/analyzers/ClusterStrategy.js';
import { UserClusterAnalyzer } from '../domain/profile/analyzers/UserClusterAnalyzer.js';

// ── Test helpers ──────────────────────────────────────────────

/** Build a profile with the expected tag structure. */
function makeProfile(tagOverrides = {}) {
  return {
    tags: {
      genre: tagOverrides.genre || {},
      mood: tagOverrides.mood || {},
      region: tagOverrides.region || {},
      behavior: tagOverrides.behavior || {},
      chat: tagOverrides.chat || {},
    },
  };
}

/** Well-separated 2-D vectors for deterministic clustering. */
const CLUSTER_A = [
  { x: 0, y: 0 },
  { x: 0.1, y: 0 },
  { x: 0, y: 0.1 },
];

const CLUSTER_B = [
  { x: 10, y: 10 },
  { x: 10.1, y: 10 },
  { x: 10, y: 10.1 },
];

// ══════════════════════════════════════════════════════════════
// BaseAnalyzer
// ══════════════════════════════════════════════════════════════

describe('BaseAnalyzer', () => {
  it('constructor_noName_defaultsToClassName', () => {
    const analyzer = new BaseAnalyzer();
    expect(analyzer.name).toBe('BaseAnalyzer');
  });

  it('constructor_customName_setsCustomName', () => {
    const analyzer = new BaseAnalyzer({ name: 'MyAnalyzer' });
    expect(analyzer.name).toBe('MyAnalyzer');
  });

  it('constructor_noEventBus_defaultsToNull', () => {
    const analyzer = new BaseAnalyzer();
    expect(analyzer.eventBus).toBeNull();
  });

  it('constructor_withEventBus_storesEventBus', () => {
    const bus = { emit: vi.fn() };
    const analyzer = new BaseAnalyzer({ eventBus: bus });
    expect(analyzer.eventBus).toBe(bus);
  });

  it('analyze_notOverridden_throwsNotImplemented', async () => {
    const analyzer = new BaseAnalyzer();
    await expect(analyzer.analyze({})).rejects.toThrow('Not implemented');
  });

  it('emit_withEventBus_callsEmitWithAnalyzerName', () => {
    const bus = { emit: vi.fn() };
    const analyzer = new BaseAnalyzer({ name: 'TestAnalyzer', eventBus: bus });
    analyzer.emit('test:event', { foo: 'bar' });
    expect(bus.emit).toHaveBeenCalledTimes(1);
    expect(bus.emit).toHaveBeenCalledWith('test:event', {
      analyzer: 'TestAnalyzer',
      foo: 'bar',
    });
  });

  it('emit_withoutEventBus_doesNotThrow', () => {
    const analyzer = new BaseAnalyzer();
    expect(() => analyzer.emit('test:event', { foo: 'bar' })).not.toThrow();
  });
});

// ══════════════════════════════════════════════════════════════
// ClusterStrategy (abstract base)
// ══════════════════════════════════════════════════════════════

describe('ClusterStrategy', () => {
  it('name_notImplemented_throwsError', () => {
    const strategy = new ClusterStrategy();
    expect(() => strategy.name).toThrow('Not implemented');
  });

  it('cluster_notImplemented_throwsError', () => {
    const strategy = new ClusterStrategy();
    expect(() => strategy.cluster([])).toThrow('Not implemented');
  });

  it('autoTune_default_returnsEmptyObject', () => {
    const strategy = new ClusterStrategy();
    expect(strategy.autoTune([])).toEqual({});
  });
});

// ══════════════════════════════════════════════════════════════
// KMeansClusterStrategy
// ══════════════════════════════════════════════════════════════

describe('KMeansClusterStrategy', () => {
  it('name_whenAccessed_returnsKmeans', () => {
    const strategy = new KMeansClusterStrategy();
    expect(strategy.name).toBe('kmeans');
  });

  it('cluster_withVectors_returnsCorrectShape', () => {
    const strategy = new KMeansClusterStrategy({ minK: 2, maxK: 4 });
    const vectors = [...CLUSTER_A, ...CLUSTER_B];
    const result = strategy.cluster(vectors, { k: 2 });

    expect(result.strategy).toBe('kmeans');
    expect(result.k).toBe(2);
    expect(Array.isArray(result.clusters)).toBe(true);
    expect(result.clusters).toHaveLength(2);

    for (const cluster of result.clusters) {
      expect(cluster).toHaveProperty('clusterId');
      expect(cluster).toHaveProperty('centroid');
      expect(cluster).toHaveProperty('members');
      expect(cluster).toHaveProperty('memberCount');
      expect(cluster.memberCount).toBe(cluster.members.length);
    }
  });

  it('cluster_withoutK_autoSelectsOptimalK', () => {
    const strategy = new KMeansClusterStrategy({ minK: 2, maxK: 4 });
    const vectors = [...CLUSTER_A, ...CLUSTER_B];
    const result = strategy.cluster(vectors);

    expect(result.k).toBeGreaterThanOrEqual(2);
    expect(result.k).toBeLessThanOrEqual(4);
    expect(result.clusters.length).toBeGreaterThan(0);
  });

  it('autoTune_withVectors_returnsKAndScore', () => {
    const strategy = new KMeansClusterStrategy({ minK: 2, maxK: 4 });
    const vectors = [...CLUSTER_A, ...CLUSTER_B];
    const tuned = strategy.autoTune(vectors);

    expect(tuned).toHaveProperty('k');
    expect(tuned).toHaveProperty('score');
    expect(tuned).toHaveProperty('metric', 'silhouette');
    expect(typeof tuned.k).toBe('number');
    expect(typeof tuned.score).toBe('number');
    expect(tuned.score).toBeGreaterThanOrEqual(-1);
    expect(tuned.score).toBeLessThanOrEqual(1);
  });

  it('findOptimalK_fewerThanMinK_returnsVectorCount', () => {
    const strategy = new KMeansClusterStrategy({ minK: 5, maxK: 8 });
    const vectors = [{ x: 1 }, { x: 2 }, { x: 3 }];
    const optimalK = strategy._findOptimalK(vectors);
    expect(optimalK).toBe(3);
  });

  it('findOptimalK_moreThanMaxK_capsAtMaxK', () => {
    const strategy = new KMeansClusterStrategy({ minK: 2, maxK: 3 });
    const vectors = [...CLUSTER_A, ...CLUSTER_B];
    const optimalK = strategy._findOptimalK(vectors);
    expect(optimalK).toBeLessThanOrEqual(3);
    expect(optimalK).toBeGreaterThanOrEqual(2);
  });

  it('distance_twoPoints_calculatesEuclidean', () => {
    const strategy = new KMeansClusterStrategy();
    const a = { x: 1, y: 2 };
    const b = { x: 4, y: 6 };
    // sqrt((1-4)^2 + (2-6)^2) = sqrt(9 + 16) = sqrt(25) = 5
    expect(strategy._distance(a, b)).toBeCloseTo(5, 10);
  });

  it('distance_samePoint_returnsZero', () => {
    const strategy = new KMeansClusterStrategy();
    const a = { x: 3, y: 7 };
    expect(strategy._distance(a, a)).toBe(0);
  });

  it('average_multipleVectors_computesMean', () => {
    const strategy = new KMeansClusterStrategy();
    const vectors = [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
      { x: 5, y: 6 },
    ];
    const avg = strategy._average(vectors);
    expect(avg.x).toBeCloseTo(3, 10);
    expect(avg.y).toBeCloseTo(4, 10);
  });

  it('nearestCentroid_givenVector_returnsNearestIndex', () => {
    const strategy = new KMeansClusterStrategy();
    const centroids = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ];
    const vector = { x: 1, y: 1 };
    expect(strategy._nearestCentroid(vector, centroids)).toBe(0);
  });

  it('nearestCentroid_closerToSecond_returnsOne', () => {
    const strategy = new KMeansClusterStrategy();
    const centroids = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ];
    const vector = { x: 9, y: 9 };
    expect(strategy._nearestCentroid(vector, centroids)).toBe(1);
  });

  it('initCentroids_givenK_returnsKCentroids', () => {
    const strategy = new KMeansClusterStrategy();
    const vectors = [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
      { x: 5, y: 6 },
    ];
    const centroids = strategy._initCentroids(vectors, 2);
    expect(centroids).toHaveLength(2);
    // Each centroid is a plain object with x and y
    for (const c of centroids) {
      expect(c).toHaveProperty('x');
      expect(c).toHaveProperty('y');
    }
  });

  it('silhouetteScore_wellSeparated_returnsHighScore', () => {
    const strategy = new KMeansClusterStrategy();
    const vectors = [...CLUSTER_A, ...CLUSTER_B];
    const score = strategy._silhouetteScore(vectors, 2);
    // Well-separated clusters should have a high silhouette score
    expect(score).toBeGreaterThan(0.5);
  });
});

// ══════════════════════════════════════════════════════════════
// DBSCANClusterStrategy
// ══════════════════════════════════════════════════════════════

describe('DBSCANClusterStrategy', () => {
  it('name_whenAccessed_returnsDbscan', () => {
    const strategy = new DBSCANClusterStrategy();
    expect(strategy.name).toBe('dbscan');
  });

  it('cluster_withSparseData_returnsShapeWithNoise', () => {
    const strategy = new DBSCANClusterStrategy({ eps: 0.5, minPts: 3 });
    const vectors = [
      { x: 0, y: 0 },
      { x: 0.1, y: 0 },
      { x: 0.2, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 20 },
    ];
    const result = strategy.cluster(vectors);

    expect(result.strategy).toBe('dbscan');
    expect(result).toHaveProperty('k');
    expect(Array.isArray(result.clusters)).toBe(true);
    expect(Array.isArray(result.noise)).toBe(true);
    // The two far-away points should be noise
    expect(result.noise.length).toBeGreaterThanOrEqual(2);
    // The three close points should form one cluster
    expect(result.clusters.length).toBe(1);
    expect(result.clusters[0].memberCount).toBe(3);
  });

  it('autoTune_withVectors_returnsEpsAndMinPts', () => {
    const strategy = new DBSCANClusterStrategy({ eps: 0.8, minPts: 5 });
    const tuned = strategy.autoTune([]);
    expect(tuned).toEqual({ eps: 0.8, minPts: 5, metric: 'density' });
  });

  it('rangeQuery_pointsWithinEps_returnsNeighborIndices', () => {
    const strategy = new DBSCANClusterStrategy({ eps: 0.5, minPts: 3 });
    const vectors = [
      { x: 0, y: 0 },
      { x: 0.3, y: 0 },
      { x: 0.6, y: 0 },
    ];
    const neighbors = strategy._rangeQuery(vectors, vectors[0]);
    // Point 0 (dist=0) and Point 1 (dist=0.3) are within eps=0.5
    // Point 2 (dist=0.6) is outside
    expect(neighbors).toContain(0);
    expect(neighbors).toContain(1);
    expect(neighbors).not.toContain(2);
  });
});

// ══════════════════════════════════════════════════════════════
// UserClusterAnalyzer
// ══════════════════════════════════════════════════════════════

describe('UserClusterAnalyzer', () => {
  it('constructor_defaults_setsNameAndKMeansStrategy', () => {
    const analyzer = new UserClusterAnalyzer();
    expect(analyzer.name).toBe('UserClusterAnalyzer');
    expect(analyzer.clusterStrategy).toBeInstanceOf(KMeansClusterStrategy);
  });

  it('constructor_customStrategy_usesProvidedStrategy', () => {
    const dbscan = new DBSCANClusterStrategy();
    const analyzer = new UserClusterAnalyzer({ clusterStrategy: dbscan });
    expect(analyzer.clusterStrategy).toBe(dbscan);
  });

  it('analyze_emptyProfile_returnsNullCluster', async () => {
    const analyzer = new UserClusterAnalyzer();
    const result = await analyzer.analyze(null, { snapshots: [] });
    expect(result.clusterId).toBeNull();
    expect(result.clusterLabel).toBeNull();
    expect(result.memberCount).toBe(0);
    expect(result.featureDimensions).toBe(33);
  });

  it('extractFeatures_fullProfile_produces33Dimensions', () => {
    const analyzer = new UserClusterAnalyzer();
    const profile = makeProfile({
      genre: { pop: { weight: 0.8 }, rock: { weight: 0.3 } },
      mood: { happy: { weight: 0.5 } },
      region: { chinese: { weight: 0.9 } },
      behavior: { skip_prone: { weight: 0.2 } },
      chat: { concise: { weight: 0.6 } },
    });
    const features = analyzer._extractFeatures(profile);
    const keys = Object.keys(features);
    expect(keys).toHaveLength(33);

    // Spot-check a few dimensions
    expect(features.genre_pop).toBe(0.8);
    expect(features.genre_rock).toBe(0.3);
    expect(features.mood_happy).toBe(0.5);
    expect(features.region_chinese).toBe(0.9);
    expect(features.behavior_skip_prone).toBe(0.2);
    expect(features.chat_concise).toBe(0.6);

    // Unspecified tags default to 0
    expect(features.genre_jazz).toBe(0);
    expect(features.mood_angry).toBe(0);
    expect(features.region_english).toBe(0);
    expect(features.behavior_loyalist).toBe(0);
    expect(features.chat_formal).toBe(0);
  });

  it('extractFeatures_nullProfile_returnsAllZeros', () => {
    const analyzer = new UserClusterAnalyzer();
    const features = analyzer._extractFeatures(null);
    expect(Object.keys(features)).toHaveLength(33);
    for (const value of Object.values(features)) {
      expect(value).toBe(0);
    }
  });

  it('generateLabel_topFeatures_returnsJoinedString', () => {
    const analyzer = new UserClusterAnalyzer();
    const centroid = {
      genre_pop: 0.8,
      mood_happy: 0.5,
      region_chinese: 0.9,
      behavior_skip_prone: 0.2,
    };
    const label = analyzer._generateLabel(centroid);
    // Sorted desc: region_chinese(0.9), genre_pop(0.8), mood_happy(0.5)
    // Labels extracted from key suffix after '_'
    expect(label).toBe('chinese\u00b7pop\u00b7happy');
  });

  it('generateLabel_emptyCentroid_returnsUnknown', () => {
    const analyzer = new UserClusterAnalyzer();
    const label = analyzer._generateLabel({});
    expect(label).toBe('unknown');
  });

  it('analyze_profileAndSnapshots_producesClusterResult', async () => {
    const analyzer = new UserClusterAnalyzer();
    const popProfile = makeProfile({
      genre: { pop: { weight: 0.9 } },
      mood: { happy: { weight: 0.8 } },
    });
    const rockProfile = makeProfile({
      genre: { rock: { weight: 0.9 } },
      mood: { angry: { weight: 0.8 } },
    });
    const snapshots = [
      { profile: popProfile },
      { profile: rockProfile },
      { profile: rockProfile },
    ];
    const result = await analyzer.analyze(popProfile, { snapshots });

    expect(result).toHaveProperty('clusterId');
    expect(typeof result.clusterId).toBe('number');
    expect(result).toHaveProperty('clusterLabel');
    expect(typeof result.clusterLabel).toBe('string');
    expect(result).toHaveProperty('memberCount');
    expect(typeof result.memberCount).toBe('number');
    expect(result.totalClusters).toBeGreaterThanOrEqual(1);
    expect(result.featureDimensions).toBe(33);
    expect(Array.isArray(result.labels)).toBe(true);
    expect(result).toHaveProperty('raw');
  });

  it('analyze_withEventBus_emitsClusterChanged', async () => {
    const eventBus = { emit: vi.fn() };
    const analyzer = new UserClusterAnalyzer({ eventBus });
    const profile = makeProfile({
      genre: { pop: { weight: 0.9 } },
      mood: { happy: { weight: 0.8 } },
    });
    const snapshots = [
      { profile: makeProfile({ genre: { rock: { weight: 0.9 } } }) },
      { profile: makeProfile({ genre: { rock: { weight: 0.8 } } }) },
    ];
    await analyzer.analyze(profile, { snapshots });

    expect(eventBus.emit).toHaveBeenCalledTimes(1);
    const [eventType, payload] = eventBus.emit.mock.calls[0];
    expect(eventType).toBe('cluster:changed');
    expect(payload.analyzer).toBe('UserClusterAnalyzer');
    expect(payload).toHaveProperty('clusterId');
    expect(payload).toHaveProperty('clusterLabel');
    expect(payload).toHaveProperty('featureDimensions', 33);
  });

  it('analyze_emptyProfile_doesNotEmitEvent', async () => {
    const eventBus = { emit: vi.fn() };
    const analyzer = new UserClusterAnalyzer({ eventBus });
    await analyzer.analyze(null, { snapshots: [] });
    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  it('analyze_snapshotsWithoutProfileKey_usesSnapshotDirectly', async () => {
    const analyzer = new UserClusterAnalyzer();
    const profile = makeProfile({
      genre: { pop: { weight: 0.9 } },
    });
    // Snapshots without a .profile key — should be treated as profile directly
    const snapshots = [
      makeProfile({ genre: { rock: { weight: 0.9 } } }),
      makeProfile({ genre: { rock: { weight: 0.8 } } }),
    ];
    const result = await analyzer.analyze(profile, { snapshots });
    expect(result.clusterId).not.toBeNull();
    expect(result.totalClusters).toBeGreaterThanOrEqual(1);
  });
});
