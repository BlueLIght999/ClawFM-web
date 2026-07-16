/**
 * UserClusterAnalyzer — unsupervised clustering of listener profiles.
 *
 * Extends BaseAnalyzer. Builds a 33-dimension feature vector from each
 * profile (genre 10 + mood 8 + region 5 + behavior 6 + chat 4), then
 * delegates clustering to an injectable ClusterStrategy (defaults to
 * KMeansClusterStrategy with silhouette auto-K).
 *
 * Domain-layer only — imports from relative paths within domain/profile/.
 * No IO, no infrastructure/db/application imports.
 */

import { BaseAnalyzer } from './BaseAnalyzer.js';
import { KMeansClusterStrategy } from './ClusterStrategy.js';

// ── Tag taxonomies (33 dimensions total) ──────────────────────
// genre(10) + mood(8) + region(5) + behavior(6) + chat(4) = 33

const GENRE_TAGS = [
  'pop', 'rock', 'folk', 'electronic', 'hiphop',
  'jazz', 'classical', 'rnb', 'metal', 'indie',
];

const MOOD_TAGS = [
  'happy', 'sad', 'energetic', 'calm',
  'nostalgic', 'romantic', 'angry', 'dreamy',
];

const REGION_TAGS = [
  'chinese', 'english', 'japanese', 'korean', 'instrumental',
];

const BEHAVIOR_TAGS = [
  'skip_prone', 'replay_lover', 'night_owl', 'morning_person',
  'explorer', 'loyalist',
];

const CHAT_TAGS = ['concise', 'detailed', 'casual', 'formal'];

export class UserClusterAnalyzer extends BaseAnalyzer {
  /**
   * @param {Object}            [opts]
   * @param {ClusterStrategy}   [opts.clusterStrategy] — defaults to KMeansClusterStrategy
   * @param {Object}            [opts.eventBus]        — optional event bus
   */
  constructor({ clusterStrategy = null, eventBus = null } = {}) {
    super({ name: 'UserClusterAnalyzer', eventBus });
    this.clusterStrategy = clusterStrategy || new KMeansClusterStrategy({ minK: 2, maxK: 8 });
  }

  /**
   * Analyze a profile by clustering it alongside historical snapshots.
   *
   * @param {Object}        profile   — current listener profile
   * @param {Object}        [options]
   * @param {Array<Object>} [options.snapshots] — historical profile snapshots
   * @returns {Promise<Object>} cluster result
   */
  async analyze(profile, options = {}) {
    const snapshots = options.snapshots || [];

    const featureVectors = this._buildFeatureVectors(profile, snapshots);

    if (featureVectors.length === 0) {
      return { clusterId: null, clusterLabel: null, memberCount: 0, featureDimensions: 33 };
    }

    const result = this.clusterStrategy.cluster(featureVectors, options);

    const labels = result.clusters.map((c) => this._generateLabel(c.centroid));

    const currentVector = featureVectors[featureVectors.length - 1];
    const currentCluster = this._findCluster(result, currentVector);

    const clusterResult = this._buildClusterResult(currentCluster, labels, result);
    this.emit('cluster:changed', clusterResult);
    return clusterResult;
  }

  _buildClusterResult(currentCluster, labels, result) {
    const clusterId = currentCluster?.clusterId ?? 0;
    return {
      clusterId,
      clusterLabel: labels[clusterId] || 'unknown',
      memberCount: currentCluster?.memberCount ?? 1,
      totalClusters: result.clusters.length,
      featureDimensions: 33,
      labels,
      raw: result,
    };
  }

  /**
   * Build feature vectors from historical snapshots + current profile.
   * Each snapshot may be a raw profile or wrapped as { profile }.
   */
  _buildFeatureVectors(profile, snapshots) {
    const vectors = [];

    for (const snapshot of snapshots) {
      const snapProfile = snapshot.profile || snapshot;
      vectors.push(this._extractFeatures(snapProfile));
    }

    if (profile) {
      vectors.push(this._extractFeatures(profile));
    }

    return vectors;
  }

  /**
   * Extract a 33-dimension numeric feature vector from a profile.
   * Missing tags default to 0.
   */
  _extractFeatures(profile) {
    const features = {};
    const tags = profile?.tags || {};

    this._extractTagCategory(features, 'genre', GENRE_TAGS, tags.genre);
    this._extractTagCategory(features, 'mood', MOOD_TAGS, tags.mood);
    this._extractTagCategory(features, 'region', REGION_TAGS, tags.region);
    this._extractTagCategory(features, 'behavior', BEHAVIOR_TAGS, tags.behavior);
    this._extractTagCategory(features, 'chat', CHAT_TAGS, tags.chat);

    return features;
  }

  _extractTagCategory(features, category, tagList, profileTags) {
    const cat = profileTags || {};
    for (const tag of tagList) {
      features[`${category}_${tag}`] = cat[tag]?.weight || 0;
    }
  }

  /**
   * Generate a human-readable label from a centroid by taking the
   * top-3 highest-weighted features and joining their suffixes with '·'.
   */
  _generateLabel(centroid) {
    const entries = Object.entries(centroid)
      .filter(([k]) => !k.startsWith('_'))
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);
    if (entries.length === 0) return 'unknown';
    return entries.map(([k]) => k.split('_')[1] || k).join('\u00b7');
  }

  /**
   * Find which cluster contains the given vector.
   * Falls back to the first cluster if no match is found.
   */
  _findCluster(result, vector) {
    for (const cluster of result.clusters) {
      if (cluster.members.some((m) => JSON.stringify(m) === JSON.stringify(vector))) {
        return cluster;
      }
    }
    return result.clusters[0] || null;
  }
}
