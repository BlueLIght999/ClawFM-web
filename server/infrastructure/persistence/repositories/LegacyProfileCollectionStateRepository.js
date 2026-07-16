import {
  getCollectionState,
  upsertCollectionState,
  getAllCollectionStates,
} from '../../../db/profileDb.js';

function toLegacyCollectionState({ lastRunAt, isFirstRun, runCount, state }) {
  return {
    lastRunAt,
    isFirstRun,
    runCount,
    stateJson: state !== null && state !== undefined ? JSON.stringify(state) : null,
  };
}

function toCollectionState(row) {
  return {
    collectorName: row.collector_name ?? row.collectorName ?? '',
    lastRunAt: row.last_run_at ?? row.lastRunAt,
    isFirstRun: row.is_first_run ?? row.isFirstRun,
    runCount: row.run_count ?? row.runCount ?? 0,
    state: row.state_json !== null && row.state_json !== undefined ? JSON.parse(row.state_json) : null,
  };
}

/**
 * Wraps legacy db/profileDb collection-state functions behind ProfileCollectionStateRepository.
 *
 * @param {object=} legacy
 */
export function createLegacyProfileCollectionStateRepository(legacy = {
  getCollectionState,
  upsertCollectionState,
  getAllCollectionStates,
}) {
  return {
    get(collectorName) {
      const row = legacy.getCollectionState(collectorName);
      return row ? toCollectionState(row) : null;
    },
    upsert(collectorName, { lastRunAt, isFirstRun, runCount, state }) {
      legacy.upsertCollectionState(
        collectorName,
        toLegacyCollectionState({ lastRunAt, isFirstRun, runCount, state }),
      );
    },
    getAll() {
      return (legacy.getAllCollectionStates() || []).map(toCollectionState);
    },
  };
}

export const legacyProfileCollectionStateRepository = createLegacyProfileCollectionStateRepository();
