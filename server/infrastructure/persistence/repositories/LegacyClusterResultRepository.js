import {
  saveClusterResult,
  getLatestClusterResults,
} from '../../../db/profileDb.js';

function toLegacyClusterResult({ clusterId, clusterLabel, features, memberCount }) {
  return {
    clusterId,
    clusterLabel,
    featureJson: JSON.stringify(features),
    memberCount,
  };
}

function toClusterResult(row) {
  return {
    clusterId: String(row.cluster_id ?? row.clusterId ?? ''),
    clusterLabel: row.cluster_label || '',
    features: JSON.parse(row.feature_json ?? row.featureJson ?? '{}'),
    memberCount: row.member_count ?? row.memberCount ?? 1,
    createdAt: row.created_at ?? row.createdAt,
  };
}

/**
 * Wraps legacy db/profileDb cluster-result functions behind ClusterResultRepository.
 *
 * @param {object=} legacy
 */
export function createLegacyClusterResultRepository(legacy = {
  saveClusterResult,
  getLatestClusterResults,
}) {
  return {
    save(cluster) {
      legacy.saveClusterResult(toLegacyClusterResult(cluster));
    },
    latest() {
      return (legacy.getLatestClusterResults() || []).map(toClusterResult);
    },
  };
}

export const legacyClusterResultRepository = createLegacyClusterResultRepository();
