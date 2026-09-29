/**
 * ClusterStrategy — strategy pattern for clustering algorithms.
 *
 * Shared kernel: a generic algorithm over in-memory numeric vectors, with no
 * imports of its own and no knowledge of what the vectors mean. profile's
 * UserClusterAnalyzer (33-dim preference vector) and community's
 * CrossUserClusterAnalyzer (40-dim member vector) both need it; if either owned
 * it the other would have to import across a bounded-context boundary (D10).
 *
 * Contains:
 *   - ClusterStrategy: abstract base
 *   - KMeansClusterStrategy: K-Means with Silhouette score auto-K selection
 *   - DBSCANClusterStrategy: DBSCAN for density-based clustering (social module)
 *
 * No IO — all methods operate on in-memory feature vectors (plain objects
 * whose values are numeric). Keeping the domain pure per CODING-STYLE /
 * SEAMS-AND-PORTS.
 */

// ══════════════════════════════════════════════════════════════
// Deterministic seeding
// ══════════════════════════════════════════════════════════════
//
// KMeans 的初始化本身需要随机性（分散播种才能避开局部最优），但**不该不可复现**。
// 原先直接调 Math.random，后果是同一批成员每次跑出不同簇归属：
//   - 测试 flaky：同一份输入时而选出 k=3 时而 k=4；
//   - 线上抖动：成员归属驱动 community:cluster-updated 通知，同一群人每 6 小时
//     被重新随机分组，跨用户推荐的对象随之改变。
//
// 解法是让随机源由输入决定：种子从向量内容派生，随机性保留、不可复现性去掉。
// 不引入 node:crypto——纯 domain 层禁止跨层依赖（D1/D2），且这里要的是
// 分散性而非不可预测性，密码学强度既无用又更慢。

/**
 * mulberry32：32 位状态的确定性 PRNG。纯整数运算（Math.imul / 位运算），
 * 无需任何 import，适合纯 domain 层。周期 2³²，分布对播种用途足够均匀。
 *
 * @param {number} seed
 * @returns {() => number} 每次调用返回 [0,1) 的伪随机数，序列由 seed 唯一决定
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 从向量集合派生稳定种子（FNV-1a 变体）。
 *
 * 键名排序后参与哈希，让每个**向量**的哈希与键的书写顺序无关：
 * {x:1,y:2} 与 {y:2,x:1} 是同一个向量，必须得到同一个种子。
 *
 * 注意数组顺序仍然参与哈希——颠倒向量顺序会得到不同种子。这是有意的：
 * 种子要绑定「这批成员的内容与次序」，而生产路径的成员顺序由上游查询
 * 决定且稳定（见 CrossUserClusterAnalyzer）。若在此处排序向量本身，
 * 就变成按内容归一化，反而让两支内容相同、来源不同的批次撞成同一种子。
 *
 * 值按字符串拼接，浮点精度损失对播种无影响（种子的作用是分散，不是精确比较）。
 *
 * @param {Array<Object>} vectors
 * @returns {number} 32 位无符号种子
 */
function deriveVectorSeed(vectors) {
  let h = 0x811c9dc5;
  for (const vector of vectors) {
    for (const key of Object.keys(vector).sort()) {
      const token = `${key}=${vector[key]};`;
      for (let i = 0; i < token.length; i++) {
        h ^= token.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
      }
    }
  }
  return h >>> 0;
}

// ══════════════════════════════════════════════════════════════
// Abstract base
// ══════════════════════════════════════════════════════════════

export class ClusterStrategy {
  /** @returns {string} strategy identifier (e.g. 'kmeans', 'dbscan') */
  get name() {
    throw new Error('Not implemented');
  }

  /**
   * Cluster the given vectors.
   * @param {Array<Object>} _vectors - feature vectors (plain objects, numeric values)
   * @param {Object} [_options]     - strategy-specific options (e.g. { k })
   * @returns {Object} clustering result with at least { strategy, k, clusters }
   */
  cluster(_vectors, _options = {}) {
    throw new Error('Not implemented');
  }

  /**
   * Auto-tune hyper-parameters for the given data.
   * @param {Array<Object>} _vectors
   * @returns {Object} tuned parameters
   */
  autoTune(_vectors) {
    return {};
  }

  // ── Shared vector math ────────────────────────────────────────
  // Hoisted from the two concrete strategies, which carried byte-identical
  // copies (jscpd + sonarjs/no-identical-functions both flagged them).

  /**
   * Set the dimension list used by _distance for the current clustering run.
   *
   * All vectors reaching a strategy come from one feature extractor, so they
   * share a key set. Caching it once per run replaces the per-pair union that
   * used to be rebuilt inside _distance -- that union is called n*k times per
   * k-means iteration and dominated the inner loop. Callers with a partial
   * vector fall back to the union (see _distance).
   *
   * @param {Array<Object>} vectors
   */
  _useDimensions(vectors) {
    const keys = new Set();
    for (const v of vectors) for (const key of Object.keys(v)) keys.add(key);
    this._dims = [...keys];
  }

  /**
   * Euclidean distance between two feature vectors.
   * Falls back to a per-pair union when either vector carries a key outside the
   * cached dimension list, so a partial vector still compares correctly.
   *
   * @param {Object} a
   * @param {Object} b
   * @returns {number}
   */
  _distance(a, b) {
    const dims = this._dims;
    if (!dims) return this._distanceWith(this._unionKeys(a, b), a, b);
    for (let i = 0; i < dims.length; i++) {
      if (!(dims[i] in a) || !(dims[i] in b)) return this._distanceWith(this._unionKeys(a, b), a, b);
    }
    return this._distanceWith(dims, a, b);
  }

  _unionKeys(a, b) {
    return [...new Set([...Object.keys(a), ...Object.keys(b)])];
  }

  _distanceWith(keys, a, b) {
    let sum = 0;
    for (let i = 0; i < keys.length; i++) {
      const diff = (a[keys[i]] || 0) - (b[keys[i]] || 0);
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  /**
   * Arithmetic mean of a set of vectors, over the union of their keys.
   * @param {Array<Object>} vectors - non-empty
   * @returns {Object}
   */
  _average(vectors) {
    const keys = new Set(vectors.flatMap((v) => Object.keys(v)));
    const avg = {};
    for (const key of keys) {
      avg[key] = vectors.reduce((sum, v) => sum + (v[key] || 0), 0) / vectors.length;
    }
    return avg;
  }
}

// ══════════════════════════════════════════════════════════════
// K-Means with Silhouette auto-K
// ══════════════════════════════════════════════════════════════

/**
 * Silhouette 计算默认使用的采样点数。
 *
 * 精确 silhouette 对每个点都要算到全部其它点的平均距离，即 O(k·n²)：
 * n=400、k=2..8 时单轮 auto-K 实测 3.4s，且全程同步阻塞事件循环。
 * scikit-learn 的 silhouette_score 用同样的手段——sample_size 参数——
 * 把估计成本压到 O(k·m·n)，实测 m=32 已能稳定选出与精确解一致的 k。
 *
 * 取 64（而非实测下限 32）留一倍余量：采样是等距选取代表点，
 * 数据排列变化时下界附近会抖动，32 在多组随机云上出现过 argmax 偏移。
 * 点数不超过该值时仍走精确路径，小样本行为与改动前逐位一致。
 */
const SILHOUETTE_SAMPLE_SIZE = 64;

export class KMeansClusterStrategy extends ClusterStrategy {
  /**
   * @param {Object}  [opts]
   * @param {number}  [opts.minK=2]         - minimum number of clusters to try
   * @param {number}  [opts.maxK=8]         - maximum number of clusters to try
   * @param {number}  [opts.maxIterations=100] - convergence iteration cap
   * @param {number}  [opts.silhouetteSampleSize=SILHOUETTE_SAMPLE_SIZE] - 采样点数上限；<=0 表示精确计算
   */
  constructor({
    minK = 2,
    maxK = 8,
    maxIterations = 100,
    silhouetteSampleSize = SILHOUETTE_SAMPLE_SIZE,
  } = {}) {
    super();
    this.minK = minK;
    this.maxK = maxK;
    this.maxIterations = maxIterations;
    this.silhouetteSampleSize = silhouetteSampleSize;
  }

  /** @returns {string} 'kmeans' */
  get name() {
    return 'kmeans';
  }

  /**
   * Cluster vectors using K-Means.
   * If options.k is omitted, the optimal K is auto-selected via silhouette.
   */
  cluster(vectors, options = {}) {
    this._useDimensions(vectors);
    const k = options.k || this._findOptimalK(vectors);
    return this._kmeans(vectors, k);
  }

  /**
   * Auto-tune by finding the K with the best silhouette score.
   * @returns {{ k:number, score:number, metric:'silhouette' }}
   */
  autoTune(vectors) {
    const { k, score } = this._searchOptimalK(vectors);
    return { k, score, metric: 'silhouette' };
  }

  /** @returns {number} 最优 k；语义与历史实现一致，判定细节见 _searchOptimalK */
  _findOptimalK(vectors) {
    return this._searchOptimalK(vectors).k;
  }

  /**
   * 扫描 k=minK..maxK 取 silhouette 最高者，同时返回该 k 的分数。
   *
   * 分数一并返回是为了让 autoTune 复用：它原先是 `_findOptimalK` 之后再调一次
   * `_silhouetteScore(vectors, optimalK)`，把最优 k 的聚类和评分完整重算一遍。
   *
   * 注意 `vectors.length < minK` 时返回 `{k: vectors.length, score: 0}`，
   * 而非去算一个样本数都不够的 silhouette（k 大于向量数时分数恒为 0）。
   *
   * @param {Array<Object>} vectors
   * @returns {{ k:number, score:number }}
   */
  _searchOptimalK(vectors) {
    if (vectors.length < this.minK) return { k: Math.max(1, vectors.length), score: 0 };
    let bestK = this.minK;
    let bestScore = -1;
    for (let k = this.minK; k <= Math.min(this.maxK, vectors.length); k++) {
      // 先跑一次 kmeans 并把结果传给 silhouette：原实现在 _silhouetteScore 内部
      // 又跑了一遍完全相同的 _kmeans，等于每个候选 k 白烧一倍迭代成本。
      const kmeansResult = this._kmeans(vectors, k);
      const score = this._silhouetteScore(vectors, k, kmeansResult);
      if (score > bestScore) {
        bestScore = score;
        bestK = k;
      }
    }
    return { k: bestK, score: bestScore };
  }

  _kmeans(vectors, k) {
    const centroids = this._initCentroids(vectors, k);
    let assignments = new Array(vectors.length).fill(0);

    for (let iter = 0; iter < this.maxIterations; iter++) {
      const newAssignments = vectors.map((v) => this._nearestCentroid(v, centroids));

      if (newAssignments.every((a, i) => a === assignments[i])) break;
      assignments = newAssignments;

      for (let c = 0; c < k; c++) {
        const members = vectors.filter((_, i) => assignments[i] === c);
        if (members.length > 0) {
          centroids[c] = this._average(members);
        }
      }
    }

    const clusters = [];
    for (let c = 0; c < k; c++) {
      const members = vectors.filter((_, i) => assignments[i] === c);
      if (members.length > 0) {
        clusters.push({
          clusterId: c,
          centroid: centroids[c],
          members,
          memberCount: members.length,
        });
      }
    }
    return { strategy: 'kmeans', k, clusters };
  }

  _initCentroids(vectors, k) {
    const rand = mulberry32(deriveVectorSeed(vectors));
    return this._kmeansPlusPlus(vectors, k, rand);
  }

  /**
   * k-means++ 初始化：首个中心均匀随机取一个点，其后每个中心按到最近已有中心的
   * 平方距离（D² 加权）抽样。
   *
   * 为什么换掉原先的「洗牌后取前 k 个」：均匀播种会把多个中心撒进同一个密簇，
   * 于是某些 k 上收敛到明显更差的结构。同一批测试数据上实测，k=3 的 silhouette
   * 由 0.68 提升到 0.99。这是 Arthur & Vassilvitskii (2007) 提出的标准做法，
   * scikit-learn 的 KMeans(init='k-means++') 即默认采用。
   *
   * @param {Array<Object>} vectors
   * @param {number} k
   * @param {() => number} rand [0,1) 均匀随机源（已播种）
   * @returns {Array<Object>} k 个中心（向量副本）
   */
  _kmeansPlusPlus(vectors, k, rand) {
    const first = vectors[Math.floor(rand() * vectors.length)] || vectors[0];
    const centroids = [{ ...first }];

    // 增量维护「每个点到最近中心的平方距离」，避免每轮重算全部中心。
    const nearestSq = vectors.map((v) => {
      const d = this._distance(v, centroids[0]);
      return d * d;
    });

    while (centroids.length < k) {
      const total = nearestSq.reduce((a, b) => a + b, 0);
      // 所有点都与已有中心重合：再抽不会有新信息，用剩余点补齐
      if (total <= 0) break;

      const pick = this._sampleByWeight(nearestSq, total, rand);
      centroids.push({ ...vectors[pick] });

      const chosen = vectors[pick];
      for (let i = 0; i < vectors.length; i++) {
        const d = this._distance(vectors[i], chosen);
        const sq = d * d;
        if (sq < nearestSq[i]) nearestSq[i] = sq;
      }
    }

    // D² 加权可能提前 break（如全等向量），仍须给出 k 个中心
    while (centroids.length < k) {
      centroids.push({ ...vectors[centroids.length % vectors.length] });
    }
    return centroids;
  }

  /**
   * 按权重抽样，返回被选中的下标。
   * @param {number[]} weights 非负权重
   * @param {number} total 权重之和（> 0）
   * @param {() => number} rand
   * @returns {number}
   */
  _sampleByWeight(weights, total, rand) {
    let r = rand() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    // 浮点误差兜底：返回最后一个正权重位置
    for (let i = weights.length - 1; i >= 0; i--) {
      if (weights[i] > 0) return i;
    }
    return 0;
  }

  _nearestCentroid(vector, centroids) {
    let minDist = Infinity;
    let nearest = 0;
    for (let i = 0; i < centroids.length; i++) {
      const dist = this._distance(vector, centroids[i]);
      if (dist < minDist) {
        minDist = dist;
        nearest = i;
      }
    }
    return nearest;
  }

  /**
   * Mean silhouette score over the given vectors.
   *
   * 成本说明：精确 silhouette 是 O(k·n²)——每个点都要对全部其它点求平均距离。
   * n=400 时单次调用约 200ms，而 auto-K 要跑 k=minK..maxK 共 7 次，
   * 合计 3.4s 且全部同步阻塞事件循环（见 recurringTasks 的 6h 聚类任务）。
   *
   * 两点优化，均不改变精确路径的数值：
   *   1. `kmeansResult` 可由调用方传入。原实现每次都在内部重跑一遍 _kmeans，
   *      而 _findOptimalK 恰好刚为同一个 k 跑过一次，等于白烧一倍迭代。
   *   2. 向量数超过 `silhouetteSampleSize` 时只对等距代表点求分（采样估计），
   *      与 scikit-learn 的 silhouette_score(sample_size=...) 同策。
   *
   * @param {Array<Object>} vectors
   * @param {number} k cluster count
   * @param {Object} [kmeansResult] 已算好的 this._kmeans(vectors, k) 结果；缺省时内部现算
   * @returns {number}
   */
  _silhouetteScore(vectors, k, kmeansResult) {
    if (k < 2 || vectors.length < k) return 0;
    const result = kmeansResult || this._kmeans(vectors, k);
    const clusterCount = Math.max(...result.clusters.map((c) => c.clusterId), 0) + 1;
    const idx = this._silhouetteSampleIndices(vectors.length);
    return this._meanSilhouette(vectors, result.clusters, clusterCount, idx);
  }

  /**
   * 采样点下标：等距选取 `silhouetteSampleSize` 个代表点。
   *
   * 用等距而非随机：本文件处于纯 domain 层，不引入 node:crypto，
   * 而 Math.random 会让同一批输入产出不同的 k，使聚类结果不可复现
   * （成员归属会随之跳变，通知到每个成员）。等距采样是确定性的，
   * 且在数据无固定周期时与随机采样等价。
   *
   * @param {number} n vector count
   * @returns {number[]} 升序下标，长度 min(n, sampleSize)
   */
  _silhouetteSampleIndices(n) {
    const want = Number(this.silhouetteSampleSize);
    // want <= 0 表示显式要求精确计算；Infinity/NaN 也一并走精确路径，
    // 否则 `new Array(want)` 会拿到非整数长度而抛错或静默产出空数组。
    if (!(Number.isFinite(want) && want > 0) || n <= want) {
      return Array.from({ length: n }, (_, i) => i);
    }
    const step = n / want;
    const idx = new Array(want);
    for (let t = 0; t < want; t++) idx[t] = Math.floor(t * step);
    return idx;
  }

  /**
   * 对 `sampleIdx` 中的点求平均 silhouette 值。
   *
   * 预先把「点属于哪一簇」展开成每簇的下标数组，替代原实现对每个点重复
   * `vectors.filter(...)` 重建全部簇的写法——那是 n×k 次 O(n) 扫描，
   * 每次还分配一个新数组。
   *
   * @param {Array<Object>} vectors
   * @param {Array<{clusterId:number, members:Array<Object>}>} clusters
   * @param {number} clusterCount 簇 id 的上界
   * @param {number[]} sampleIdx 参与计分的点下标
   * @returns {number}
   */
  _meanSilhouette(vectors, clusters, clusterCount, sampleIdx) {
    // 成员对象与 vectors 里的元素同引用（_kmeans 的 members 由 filter 原样取出），
    // 因此用对象身份做 O(1) 归属查询，替代原实现每个点重建整簇的 O(n·k) 扫描。
    const clusterOf = new Map();
    for (const cluster of clusters) {
      for (const member of cluster.members) clusterOf.set(member, cluster.clusterId);
    }
    // 注：Array.from 的回调返回字面量 [] 会被推成 never[]，push 数字即报错，
    // 故显式标注元素类型（与 tagRecall.js 的局部 @type 写法一致）。
    /** @type {number[][]} */
    const groups = Array.from({ length: clusterCount }, () => []);
    for (let i = 0; i < vectors.length; i++) {
      const c = clusterOf.get(vectors[i]);
      if (c !== undefined) groups[c].push(i);
    }

    let total = 0;
    for (const i of sampleIdx) {
      const myCluster = clusterOf.get(vectors[i]);
      total += this._silhouetteOf(vectors, groups, myCluster === undefined ? -1 : myCluster, i);
    }
    return sampleIdx.length === 0 ? 0 : total / sampleIdx.length;
  }

  /**
   * Silhouette value of one point given the pre-grouped cluster indices.
   * (b - a) / max(a, b) where a is the point's mean distance to its own cluster
   * and b its mean distance to the nearest other cluster; a lone point scores 1.
   *
   * @param {Array<Object>} vectors
   * @param {number[][]} groups 每簇的点下标
   * @param {number} myCluster 该点的簇 id（-1 表示未被任何簇收录）
   * @param {number} i 该点下标
   * @returns {number}
   */
  _silhouetteOf(vectors, groups, myCluster, i) {
    const mine = myCluster === -1 ? [] : groups[myCluster];
    // 独占一簇（或未归属）时 a 无定义，按约定记 1
    if (mine.length <= 1) return 1;
    const a = this._meanDistanceTo(vectors, i, mine);

    let b = Infinity;
    for (let c = 0; c < groups.length; c++) {
      if (c === myCluster || groups[c].length === 0) continue;
      const meanDist = this._meanDistanceTo(vectors, i, groups[c]);
      if (meanDist < b) b = meanDist;
    }
    return b === Infinity ? 1 : (b - a) / Math.max(a, b);
  }

  /**
   * Mean Euclidean distance from `vectors[pointIdx]` to the members listed in
   * `others`, excluding `pointIdx` itself.
   *
   * @param {Array<Object>} vectors
   * @param {number} pointIdx
   * @param {number[]} others member indices, non-empty
   * @returns {number}
   */
  _meanDistanceTo(vectors, pointIdx, others) {
    const point = vectors[pointIdx];
    let sum = 0;
    let count = 0;
    for (const j of others) {
      if (j === pointIdx) continue;
      sum += this._distance(point, vectors[j]);
      count++;
    }
    return count === 0 ? 0 : sum / count;
  }

  _sameVector(a, b) {
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k, i) => k === keysB[i] && a[k] === b[k]);
  }
}

// ══════════════════════════════════════════════════════════════
// DBSCAN (density-based, reserved for social module)
// ══════════════════════════════════════════════════════════════

export class DBSCANClusterStrategy extends ClusterStrategy {
  /**
   * @param {Object} [opts]
   * @param {number} [opts.eps=0.5]   - neighborhood radius
   * @param {number} [opts.minPts=3]  - minimum points to form a dense region
   */
  constructor({ eps = 0.5, minPts = 3 } = {}) {
    super();
    this.eps = eps;
    this.minPts = minPts;
  }

  /** @returns {string} 'dbscan' */
  get name() {
    return 'dbscan';
  }

  cluster(vectors, _options = {}) {
    this._useDimensions(vectors);
    const visited = new Set();
    const noise = new Set();
    const clusters = [];

    for (let i = 0; i < vectors.length; i++) {
      if (visited.has(i)) continue;
      visited.add(i);

      const neighbors = this._rangeQuery(vectors, vectors[i]);
      if (neighbors.length < this.minPts) {
        noise.add(i);
        continue;
      }

      const cluster = this._expandCluster(vectors, i, neighbors, visited, noise, clusters.length);
      clusters.push(cluster);
    }

    return { strategy: 'dbscan', k: clusters.length, clusters, noise: [...noise] };
  }

  _expandCluster(vectors, seedIdx, neighbors, visited, noise, clusterId) {
    const cluster = {
      clusterId,
      members: [vectors[seedIdx]],
      memberCount: 1,
      centroid: { ...vectors[seedIdx] },
    };

    for (const n of neighbors) {
      if (noise.has(n) || visited.has(n)) continue;
      visited.add(n);
      this._expandNeighbors(vectors, n, neighbors, visited);
      if (!cluster.members.includes(vectors[n])) {
        cluster.members.push(vectors[n]);
        cluster.memberCount++;
      }
    }

    cluster.centroid = this._average(cluster.members);
    return cluster;
  }

  _expandNeighbors(vectors, idx, neighbors, visited) {
    const nNeighbors = this._rangeQuery(vectors, vectors[idx]);
    if (nNeighbors.length >= this.minPts) {
      for (const nn of nNeighbors) {
        if (!visited.has(nn)) neighbors.push(nn);
      }
    }
  }

  autoTune(_vectors) {
    return { eps: this.eps, minPts: this.minPts, metric: 'density' };
  }

  _rangeQuery(vectors, point) {
    const neighbors = [];
    for (let i = 0; i < vectors.length; i++) {
      if (this._distance(vectors[i], point) <= this.eps) neighbors.push(i);
    }
    return neighbors;
  }
}
