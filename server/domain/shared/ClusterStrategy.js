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

export class KMeansClusterStrategy extends ClusterStrategy {
  /**
   * @param {Object}  [opts]
   * @param {number}  [opts.minK=2]         - minimum number of clusters to try
   * @param {number}  [opts.maxK=8]         - maximum number of clusters to try
   * @param {number}  [opts.maxIterations=100] - convergence iteration cap
   */
  constructor({ minK = 2, maxK = 8, maxIterations = 100 } = {}) {
    super();
    this.minK = minK;
    this.maxK = maxK;
    this.maxIterations = maxIterations;
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
    const optimalK = this._findOptimalK(vectors);
    const score = this._silhouetteScore(vectors, optimalK);
    return { k: optimalK, score, metric: 'silhouette' };
  }

  _findOptimalK(vectors) {
    if (vectors.length < this.minK) return Math.max(1, vectors.length);
    let bestK = this.minK;
    let bestScore = -1;
    for (let k = this.minK; k <= Math.min(this.maxK, vectors.length); k++) {
      const score = this._silhouetteScore(vectors, k);
      if (score > bestScore) {
        bestScore = score;
        bestK = k;
      }
    }
    return bestK;
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
    const indices = [...vectors.keys()];
    // Fisher-Yates with Math.random is the correct choice for k-means seeding: the
    // requirement is spread across the input, not unpredictability, and a
    // cryptographic source would be slower while changing nothing about the result.
    // Math.random is also the only option available in this pure domain layer,
    // which must not import node:crypto.
    for (let i = indices.length - 1; i > 0; i--) {
      // eslint-disable-next-line sonarjs/pseudo-random
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices.slice(0, k).map((i) => ({ ...vectors[i] }));
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

  _silhouetteScore(vectors, k) {
    if (k < 2 || vectors.length < k) return 0;
    const result = this._kmeans(vectors, k);
    const assignments = vectors.map((v) => {
      for (const cluster of result.clusters) {
        if (cluster.members.some((m) => this._sameVector(m, v))) return cluster.clusterId;
      }
      return 0;
    });

    let totalScore = 0;
    for (let i = 0; i < vectors.length; i++) {
      totalScore += this._silhouetteFor(vectors, assignments, i, k);
    }
    return totalScore / vectors.length;
  }

  /**
   * Silhouette value for a single point: (b - a) / max(a, b), where a is its mean
   * distance to its own cluster and b its mean distance to the nearest other
   * cluster. A point alone in its cluster scores 1.
   *
   * Extracted from the loop in _silhouetteScore to keep that method's branching
   * readable; the arithmetic is unchanged.
   *
   * @param {Array<Object>} vectors
   * @param {number[]} assignments cluster index per vector
   * @param {number} i index of the point being scored
   * @param {number} k cluster count
   * @returns {number}
   */
  _silhouetteFor(vectors, assignments, i, k) {
    const myCluster = assignments[i];
    const sameCluster = vectors.filter((_, j) => assignments[j] === myCluster && j !== i);
    if (sameCluster.length === 0) return 1;
    const a = this._meanDistanceTo(vectors[i], sameCluster);

    let b = Infinity;
    for (let c = 0; c < k; c++) {
      if (c === myCluster) continue;
      const otherCluster = vectors.filter((_, j) => assignments[j] === c);
      if (otherCluster.length === 0) continue;
      const meanDist = this._meanDistanceTo(vectors[i], otherCluster);
      if (meanDist < b) b = meanDist;
    }

    return b === Infinity ? 1 : (b - a) / Math.max(a, b);
  }

  /**
   * Mean Euclidean distance from `point` to every member of `others`.
   * @param {Object} point
   * @param {Array<Object>} others non-empty
   * @returns {number}
   */
  _meanDistanceTo(point, others) {
    const sum = others.reduce((acc, v) => acc + this._distance(point, v), 0);
    return sum / others.length;
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
