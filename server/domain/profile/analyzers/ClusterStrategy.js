/**
 * ClusterStrategy — strategy pattern for clustering algorithms.
 *
 * Domain-layer abstraction. Contains:
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
   * @param {Array<Object>} vectors — feature vectors (plain objects, numeric values)
   * @param {Object} [options]     — strategy-specific options (e.g. { k })
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
}

// ══════════════════════════════════════════════════════════════
// K-Means with Silhouette auto-K
// ══════════════════════════════════════════════════════════════

export class KMeansClusterStrategy extends ClusterStrategy {
  /**
   * @param {Object}  [opts]
   * @param {number}  [opts.minK=2]         — minimum number of clusters to try
   * @param {number}  [opts.maxK=8]         — maximum number of clusters to try
   * @param {number}  [opts.maxIterations=100] — convergence iteration cap
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
    for (let i = indices.length - 1; i > 0; i--) {
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

  _distance(a, b) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    let sum = 0;
    for (const key of keys) {
      const diff = (a[key] || 0) - (b[key] || 0);
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  _average(vectors) {
    const keys = new Set(vectors.flatMap((v) => Object.keys(v)));
    const avg = {};
    for (const key of keys) {
      avg[key] = vectors.reduce((sum, v) => sum + (v[key] || 0), 0) / vectors.length;
    }
    return avg;
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
      const myCluster = assignments[i];
      const sameCluster = vectors.filter((_, j) => assignments[j] === myCluster && j !== i);
      if (sameCluster.length === 0) {
        totalScore += 1;
        continue;
      }
      const a = sameCluster.reduce((sum, v) => sum + this._distance(vectors[i], v), 0) / sameCluster.length;

      let b = Infinity;
      for (let c = 0; c < k; c++) {
        if (c === myCluster) continue;
        const otherCluster = vectors.filter((_, j) => assignments[j] === c);
        if (otherCluster.length === 0) continue;
        const meanDist =
          otherCluster.reduce((sum, v) => sum + this._distance(vectors[i], v), 0) / otherCluster.length;
        if (meanDist < b) b = meanDist;
      }

      totalScore += b === Infinity ? 1 : (b - a) / Math.max(a, b);
    }
    return totalScore / vectors.length;
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
   * @param {number} [opts.eps=0.5]   — neighborhood radius
   * @param {number} [opts.minPts=3]  — minimum points to form a dense region
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

  _distance(a, b) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    let sum = 0;
    for (const key of keys) {
      const diff = (a[key] || 0) - (b[key] || 0);
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  _average(vectors) {
    const keys = new Set(vectors.flatMap((v) => Object.keys(v)));
    const avg = {};
    for (const key of keys) {
      avg[key] = vectors.reduce((sum, v) => sum + (v[key] || 0), 0) / vectors.length;
    }
    return avg;
  }
}
