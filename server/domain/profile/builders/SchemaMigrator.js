/**
 * SchemaMigrator — version migration for profile schemas.
 *
 * Domain-layer abstraction. Maintains a registry of stepwise migration
 * functions (e.g. v1->v2, v2->v3) and applies them in sequence until
 * the profile reaches the target schema version. No IO lives here —
 * the migrator operates on plain profile objects.
 *
 * Never import infrastructure, db, or application layers.
 */

export class SchemaMigrator {
  constructor() {
    this.migrations = new Map();
    this.targetVersion = 1;
  }

  /**
   * Register a migration function from one version to the next.
   * @param {number} fromVersion
   * @param {number} toVersion
   * @param {(profile: Object) => Object} migrateFn
   */
  register(fromVersion, toVersion, migrateFn) {
    this.migrations.set(`${fromVersion}\u2192${toVersion}`, migrateFn);
    if (toVersion > this.targetVersion) this.targetVersion = toVersion;
  }

  /**
   * Migrate a profile up to the target version.
   * Stops gracefully when no further migration is registered.
   * @param {Object|null} profile
   * @returns {Object|null}
   */
  migrate(profile) {
    if (!profile) return profile;
    let current = profile.schemaVersion || 1;
    let result = { ...profile };

    while (current < this.targetVersion) {
      const key = `${current}\u2192${current + 1}`;
      const migrateFn = this.migrations.get(key);
      if (!migrateFn) break;
      result = migrateFn(result);
      result.schemaVersion = current + 1;
      current++;
    }

    return result;
  }

  /**
   * Check whether a profile is below the target version.
   * @param {Object|null} profile
   * @returns {boolean}
   */
  needsMigration(profile) {
    if (!profile) return false;
    return (profile.schemaVersion || 1) < this.targetVersion;
  }
}

// Singleton with no registered migrations yet (v1 is current)
export const schemaMigrator = new SchemaMigrator();
