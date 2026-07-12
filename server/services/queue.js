import { SongQueue } from '../domain/playback/SongQueue.js';
import { legacyQueueSnapshotRepository } from '../infrastructure/persistence/repositories/LegacyQueueSnapshotRepository.js';

class PersistableSongQueue extends SongQueue {
  persist() {
    legacyQueueSnapshotRepository.save(this.toState());
  }

  init() {
    const saved = legacyQueueSnapshotRepository.latest();
    if (saved) this.loadFromState(saved);
  }
}

export { PersistableSongQueue as SongQueue };
export const queue = new PersistableSongQueue();
