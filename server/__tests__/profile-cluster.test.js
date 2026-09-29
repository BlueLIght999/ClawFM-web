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

  // ── 采样 silhouette（成本优化）────────────────────────────────
  // 精确 silhouette 是 O(k·n²)，n=400 时单轮 auto-K 约 3.4s 且全程阻塞事件循环。
  // 超过 silhouetteSampleSize 后改为等距采样估计；以下锁住采样的选取规则与边界。

  describe('silhouette sampling', () => {
    it('sampleIndices_nBelowSampleSize_returnsEveryIndex', () => {
      const strategy = new KMeansClusterStrategy({ silhouetteSampleSize: 64 });
      expect(strategy._silhouetteSampleIndices(10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('sampleIndices_nAtSampleSize_returnsEveryIndex', () => {
      // 边界包含：n 恰好等于样本量时不去采样，保证小样本行为与精确路径一致
      const strategy = new KMeansClusterStrategy({ silhouetteSampleSize: 5 });
      expect(strategy._silhouetteSampleIndices(5)).toEqual([0, 1, 2, 3, 4]);
    });

    it('sampleIndices_nAboveSampleSize_returnsEvenlySpacedIndices', () => {
      const strategy = new KMeansClusterStrategy({ silhouetteSampleSize: 4 });
      expect(strategy._silhouetteSampleIndices(10)).toEqual([0, 2, 5, 7]);
    });

    it('sampleIndices_isDeterministic', () => {
      // 采样必须可复现：若用 Math.random，同一批成员每次算出的 k 会跳变，
      // 簇归属随之抖动并把通知发给不同的人。
      const strategy = new KMeansClusterStrategy({ silhouetteSampleSize: 8 });
      const first = strategy._silhouetteSampleIndices(500);
      const second = strategy._silhouetteSampleIndices(500);
      expect(first).toEqual(second);
      expect(first).toHaveLength(8);
    });

    it('sampleIndices_lastIndexStaysInBounds', () => {
      // 步长取整不得越界（floor(t*step) 在 t 最大时可能等于 n）
      const strategy = new KMeansClusterStrategy({ silhouetteSampleSize: 7 });
      const idx = strategy._silhouetteSampleIndices(10);
      for (const i of idx) {
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(10);
      }
    });

    it('sampleIndices_nonPositiveSampleSize_returnsEveryIndex', () => {
      // <=0 是「显式要求精确计算」的开关
      for (const size of [0, -1]) {
        const strategy = new KMeansClusterStrategy({ silhouetteSampleSize: size });
        expect(strategy._silhouetteSampleIndices(12)).toHaveLength(12);
      }
    });

    it('sampleSizeNotANumber_fallsBackToExactInsteadOfThrowing', () => {
      // Infinity/NaN 若走进 new Array(want) 会抛 RangeError；必须回落精确路径
      for (const size of [Number.NaN, Number.POSITIVE_INFINITY, 'abc']) {
        const strategy = new KMeansClusterStrategy({ silhouetteSampleSize: size });
        expect(() => strategy._silhouetteSampleIndices(12)).not.toThrow();
        expect(strategy._silhouetteSampleIndices(12)).toHaveLength(12);
      }
    });

    it('silhouetteScore_sampledPath_stillScoresWellSeparatedDataHigh', () => {
      // 采样是估计，不该把明显分离的数据算成低分
      const vectors = [];
      for (let i = 0; i < 60; i++) {
        vectors.push({ x: 0 + (i % 5) * 0.02, y: 0 });
        vectors.push({ x: 10 + (i % 5) * 0.02, y: 10 });
      }
      const strategy = new KMeansClusterStrategy({ silhouetteSampleSize: 16 });
      expect(strategy._silhouetteScore(vectors, 2)).toBeGreaterThan(0.5);
    });

    it('findOptimalK_sampledPath_picksKNearlyAsGoodAsExactPicks', () => {
      // 采样只是估计，不能断言「与精确路径选出同一个 k」：_initCentroids 用
      // Math.random 播种，两条路径各自跑 kmeans，个别 k 上会出现等价最优的平局，
      // 断言相等会让测试随机失败。
      //
      // 真正要守的契约是：采样选出的 k，其**精确** silhouette 分数不显著低于
      // 精确路径所选 k 的分数——即采样没有因为省成本而选出一个明显更差的结构。
      const vectors = [];
      for (let i = 0; i < 80; i++) {
        vectors.push({ x: (i % 4) * 0.05, y: (i % 4) * 0.05 });
        vectors.push({ x: 10 + (i % 4) * 0.05, y: 10 });
        vectors.push({ x: -10 + (i % 4) * 0.05, y: 5 });
      }
      const exact = new KMeansClusterStrategy({ maxK: 5, silhouetteSampleSize: 0 });
      const sampled = new KMeansClusterStrategy({ maxK: 5, silhouetteSampleSize: 32 });

      const exactK = exact._findOptimalK(vectors);
      const sampledK = sampled._findOptimalK(vectors);

      // 选出的 k 都必须落在声明的搜索区间内
      for (const k of [exactK, sampledK]) {
        expect(k).toBeGreaterThanOrEqual(2);
        expect(k).toBeLessThanOrEqual(5);
      }

      // 用精确分数评估两者，采样不得落后多于 0.05（值域 [-1,1]）
      const exactScoreOfExactK = exact._silhouetteScore(vectors, exactK);
      const exactScoreOfSampledK = exact._silhouetteScore(vectors, sampledK);
      expect(exactScoreOfSampledK).toBeGreaterThan(exactScoreOfExactK - 0.05);
    });
  });

  // ── 预计算 kmeans 结果的复用 ──────────────────────────────────
  describe('kmeans result reuse', () => {
    it('silhouetteScore_withProvidedKmeansResult_matchesSelfComputed', () => {
      // 传入预计算结果与内部现算必须同值：_findOptimalK 靠这个契约
      // 省掉每个候选 k 上重复的一整轮 _kmeans。
      const vectors = [...CLUSTER_A, ...CLUSTER_B];
      const strategy = new KMeansClusterStrategy({ silhouetteSampleSize: 0 });
      strategy._useDimensions(vectors);
      const km = strategy._kmeans(vectors, 2);
      expect(strategy._silhouetteScore(vectors, 2, km)).toBe(strategy._silhouetteScore(vectors, 2));
    });

    it('searchOptimalK_returnsKAndItsScore_consistentWithSilhouetteScore', () => {
      const vectors = [...CLUSTER_A, ...CLUSTER_B];
      const strategy = new KMeansClusterStrategy({ maxK: 4, silhouetteSampleSize: 0 });
      strategy._useDimensions(vectors);
      const { k, score } = strategy._searchOptimalK(vectors);
      expect(score).toBe(strategy._silhouetteScore(vectors, k));
    });

    it('searchOptimalK_fewerVectorsThanMinK_scoresZeroWithoutClustering', () => {
      const strategy = new KMeansClusterStrategy({ minK: 5, maxK: 8 });
      expect(strategy._searchOptimalK([{ x: 1 }, { x: 2 }])).toEqual({ k: 2, score: 0 });
    });

    it('autoTune_score_comesFromTheSelectedK', () => {
      // autoTune 过去在 _findOptimalK 之后重算了一遍 silhouetteScore(optimalK)，
      // 现在直接复用搜索时的分数——必须仍是该 k 自己的分数。
      const vectors = [...CLUSTER_A, ...CLUSTER_B];
      const strategy = new KMeansClusterStrategy({ maxK: 4, silhouetteSampleSize: 0 });
      const tuned = strategy.autoTune(vectors);
      expect(tuned.score).toBe(strategy._silhouetteScore(vectors, tuned.k));
    });
  });

  // ── 确定性播种 ────────────────────────────────────────────────
  // 原先 _initCentroids 用 Math.random，同一份输入时而选出 k=3 时而 k=4，
  // 且簇归属每次重排（成员会被反复随机分组、通知对象随之改变）。
  // 现改为由向量内容派生种子，随机性保留、不可复现性去掉。
  describe('deterministic seeding', () => {
    it('cluster_sameInputTwice_producesIdenticalAssignments', () => {
      const strategy = new KMeansClusterStrategy({ maxK: 4 });
      const vectors = [...CLUSTER_A, ...CLUSTER_B];
      const a = strategy.cluster(vectors);
      const b = strategy.cluster(vectors);

      expect(a.k).toBe(b.k);
      expect(a.clusters.map((c) => c.memberCount)).toEqual(b.clusters.map((c) => c.memberCount));
      // 成员序列也必须一致，不只是计数
      expect(a.clusters.map((c) => c.members.map((m) => m.x))).toEqual(
        b.clusters.map((c) => c.members.map((m) => m.x)),
      );
    });

    it('cluster_repeatedCalls_neverDriftAcrossManyRuns', () => {
      // 单次比对可能撞上巧合；连跑 20 次确认没有任何一次偏移
      const strategy = new KMeansClusterStrategy({ maxK: 5 });
      const vectors = [];
      for (let i = 0; i < 40; i++) {
        vectors.push({ x: (i % 4) * 0.05, y: 0 });
        vectors.push({ x: 10 + (i % 4) * 0.05, y: 10 });
      }
      const baseline = strategy.cluster(vectors);
      for (let run = 0; run < 20; run++) {
        const again = strategy.cluster(vectors);
        expect(again.k).toBe(baseline.k);
        expect(again.clusters.map((c) => c.memberCount)).toEqual(baseline.clusters.map((c) => c.memberCount));
      }
    });

    it('findOptimalK_sameInput_repeatedlyReturnsSameK', () => {
      const strategy = new KMeansClusterStrategy({ maxK: 5 });
      const vectors = [];
      for (let i = 0; i < 40; i++) {
        vectors.push({ x: (i % 4) * 0.05, y: 0 });
        vectors.push({ x: 10 + (i % 4) * 0.05, y: 10 });
      }
      const first = strategy._findOptimalK(vectors);
      for (let run = 0; run < 20; run++) {
        expect(strategy._findOptimalK(vectors)).toBe(first);
      }
    });

    it('initCentroids_isDeterministicForSameVectors', () => {
      const strategy = new KMeansClusterStrategy();
      const vectors = [...CLUSTER_A, ...CLUSTER_B];
      const a = strategy._initCentroids(vectors, 3);
      const b = strategy._initCentroids(vectors, 3);
      expect(a).toEqual(b);
    });

    it('initCentroids_isIndependentOfVectorInsertionOrder', () => {
      // 同一批成员的**数组顺序**参与哈希（见 initCentroids_reversedVectorOrder_mayDiffer），
      // 但无论顺序如何都不能抛错、都必须给出 k 个中心。
      const strategy = new KMeansClusterStrategy();
      const a = strategy._initCentroids([...CLUSTER_A, ...CLUSTER_B], 3);
      const shuffled = [...CLUSTER_B, ...CLUSTER_A];
      const b = strategy._initCentroids(shuffled, 3);
      expect(a).toHaveLength(3);
      expect(b).toHaveLength(3);
    });

    it('initCentroids_keyOrderWithinVector_doesNotChangeResult', () => {
      // deriveVectorSeed 对键名排序后再哈希，所以 {x,y} 与 {y,x} 是同一个向量。
      // 断言前必须按键排序比较：{...first} 让中心继承了源对象的键书写顺序，
      // 直接 toEqual 会拿 "键序" 当差异，把等价结果判成不等价。
      const strategy = new KMeansClusterStrategy();
      const keyOrdered = (centroids) =>
        JSON.stringify(centroids.map((c) => Object.keys(c).sort().map((k) => [k, c[k]])));

      const ordered = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];
      const flipped = [{ y: 0, x: 0 }, { y: 0, x: 1 }, { y: 0, x: 2 }];

      expect(keyOrdered(strategy._initCentroids(ordered, 2)))
        .toBe(keyOrdered(strategy._initCentroids(flipped, 2)));
    });

    it('initCentroids_reversedVectorOrder_mayDiffer', () => {
      // 对照上一条：向量**数组**顺序参与哈希，换序会得到不同种子。
      // 这不是缺陷——生产路径的成员顺序由上游查询决定且稳定，
      // 这里只是把「种子绑定内容」这个事实钉住，防止误以为结果与排序无关。
      const strategy = new KMeansClusterStrategy();
      const points = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 5, y: 5 }];
      expect(strategy._initCentroids(points, 2))
        .not.toEqual(strategy._initCentroids([...points].reverse(), 2));
    });

    it('initCentroids_returnsExactlyKCentroids', () => {
      const strategy = new KMeansClusterStrategy();
      const vectors = [...CLUSTER_A, ...CLUSTER_B];
      for (const k of [1, 2, 3, 6]) {
        expect(strategy._initCentroids(vectors, k)).toHaveLength(k);
      }
    });

    it('initCentroids_identicalVectors_padsToKWithoutInfiniteLoop', () => {
      // D² 加权在全等向量上权重和为 0：不能死循环，仍须返回 k 个中心
      const strategy = new KMeansClusterStrategy();
      const vectors = Array.from({ length: 5 }, () => ({ x: 1, y: 1 }));
      const centroids = strategy._initCentroids(vectors, 4);
      expect(centroids).toHaveLength(4);
      for (const c of centroids) expect(c).toEqual({ x: 1, y: 1 });
    });

    it('kmeansPlusPlus_isDeterministicWithSameRandomSource', () => {
      const strategy = new KMeansClusterStrategy();
      const vectors = [...CLUSTER_A, ...CLUSTER_B];
      const makeRand = () => {
        let a = 12345 >>> 0;
        return () => {
          a = (a + 0x6d2b79f5) >>> 0;
          let t = a;
          t = Math.imul(t ^ (t >>> 15), 1 | t);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      };
      expect(strategy._kmeansPlusPlus(vectors, 3, makeRand())).toEqual(
        strategy._kmeansPlusPlus(vectors, 3, makeRand()),
      );
    });

    it('sampleByWeight_picksIndexWithinBounds', () => {
      const strategy = new KMeansClusterStrategy();
      const weights = [1, 0, 3, 0, 2];
      const total = 6;
      for (let i = 0; i < 50; i++) {
        const idx = strategy._sampleByWeight(weights, total, Math.random);
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(weights.length);
        expect(weights[idx]).toBeGreaterThan(0);
      }
    });

    it('sampleByWeight_zeroWeightSlotsAreNeverPicked', () => {
      // [0, 5, 0]：只有下标 1 有权重，抽样必须恒为 1
      const strategy = new KMeansClusterStrategy();
      for (let i = 0; i < 30; i++) {
        expect(strategy._sampleByWeight([0, 5, 0], 5, Math.random)).toBe(1);
      }
    });
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
