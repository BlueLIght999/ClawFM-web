import { SongQueue } from '../domain/playback/SongQueue.js';

class PersistableSongQueue extends SongQueue {
  /** @type {import('../application/ports/persistence/QueueSnapshotRepository.js').QueueSnapshotRepository | null} */
  _snapshotRepo = null;

  /** Inject repository via bootstrap.js (D8 compliance) */
  set snapshotRepository(repo) { this._snapshotRepo = repo; }

  persist() {
    if (this._snapshotRepo) this._snapshotRepo.save(this.toState());
  }

  init() {
    if (!this._snapshotRepo) return;
    const saved = this._snapshotRepo.latest();
    if (saved) this.loadFromState(saved);
  }
}

export { PersistableSongQueue as SongQueue };
export const queue = new PersistableSongQueue();
