import { describe, it, expect } from 'vitest';
import { createRecommendationSnapshot } from '../domain/curation/recommendationSnapshot.js';

describe('recommendation snapshot', () => {
  it('copiesFutureSongsAndCurrentSongForRollback', () => {
    const queue = {
      future: [{ id: 'a' }, { id: 'b' }],
      current: { id: 'current', title: 'Now' },
    };

    const snapshot = createRecommendationSnapshot(queue);

    expect(snapshot).toEqual({
      future: [{ id: 'a' }, { id: 'b' }],
      current: { id: 'current', title: 'Now' },
    });
    expect(snapshot.future).not.toBe(queue.future);
    expect(snapshot.current).not.toBe(queue.current);
  });

  it('usesNullCurrentWhenQueueHasNoCurrentSong', () => {
    const snapshot = createRecommendationSnapshot({ future: [], current: null });

    expect(snapshot).toEqual({ future: [], current: null });
  });
});
