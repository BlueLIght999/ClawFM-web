import {
  getLatestQueueSnapshot,
  saveQueueSnapshot,
} from '../../../db/history.js';

/**
 * Wraps legacy db/history queue snapshot functions behind QueueSnapshotRepository.
 *
 * @param {{getLatestQueueSnapshot: () => string|null, saveQueueSnapshot: (stateJson: string) => void}=} legacy
 */
export function createLegacyQueueSnapshotRepository(legacy = {
  getLatestQueueSnapshot,
  saveQueueSnapshot,
}) {
  return {
    save(state) {
      legacy.saveQueueSnapshot(JSON.stringify(state));
    },
    latest() {
      const saved = legacy.getLatestQueueSnapshot();
      if (!saved) return null;
      return typeof saved === 'string' ? JSON.parse(saved) : saved;
    },
  };
}

export const legacyQueueSnapshotRepository = createLegacyQueueSnapshotRepository();
