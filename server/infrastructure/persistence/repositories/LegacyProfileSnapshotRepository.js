import {
  saveProfileSnapshot,
  getProfileSnapshots,
  getLatestProfileSnapshot,
} from '../../../db/profileDb.js';

function toProfileSnapshot(row) {
  return {
    id: row.id,
    profile: JSON.parse(row.snapshot_json ?? row.snapshotJson ?? '{}'),
    schemaVersion: row.schema_version ?? row.schemaVersion ?? 1,
    createdAt: row.created_at ?? row.createdAt,
  };
}

/**
 * Wraps legacy db/profileDb profile-snapshot functions behind ProfileSnapshotRepository.
 *
 * @param {object=} legacy
 */
export function createLegacyProfileSnapshotRepository(legacy = {
  saveProfileSnapshot,
  getProfileSnapshots,
  getLatestProfileSnapshot,
}) {
  return {
    save(profile, schemaVersion) {
      legacy.saveProfileSnapshot(JSON.stringify(profile), schemaVersion);
    },
    recent(limit) {
      return (legacy.getProfileSnapshots(limit) || []).map(toProfileSnapshot);
    },
    latest() {
      const row = legacy.getLatestProfileSnapshot();
      return row ? toProfileSnapshot(row) : null;
    },
  };
}

export const legacyProfileSnapshotRepository = createLegacyProfileSnapshotRepository();
