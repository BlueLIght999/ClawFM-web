import { describe, expect, it } from 'vitest';
import {
  buildAgentExecTrace,
  buildSearchToolResults,
  latestToolResults,
  nextRecommendationSnapshot,
} from '../agent/domain/agentTurnRules.js';

describe('agent turn rules', () => {
  it('buildSearchToolResults_formatsStableSongFieldsAndLegacyArtists', () => {
    const result = buildSearchToolResults([
      { title: 'Stable Song', artist: 'Stable Artist' },
      { name: 'Legacy Song', ar: [{ name: 'Legacy Artist' }] },
    ]);

    expect(result).toBe(
      'Search matched 2 song(s): Stable Song by Stable Artist; Legacy Song by Legacy Artist. These are now queued. Acknowledge this briefly and naturally in your DJ style - mention 1-2 highlights, don\'t list all of them.'
    );
  });

  it('latestToolResults_keepsTheMostRecentNonEmptyToolResult', () => {
    expect(latestToolResults('', 'fast result', '', 'search result')).toBe('search result');
    expect(latestToolResults('', null, undefined)).toBe('');
  });

  it('nextRecommendationSnapshot_keepsSnapshotOnlyForRecommendationRejectionActions', () => {
    const snapshot = { future: [{ id: 'old' }], current: { id: 'now' } };

    expect(nextRecommendationSnapshot({ action: 'reject_recommend' }, snapshot)).toBe(snapshot);
    expect(nextRecommendationSnapshot({ action: 'recommend_rollback' }, snapshot)).toBe(snapshot);
    expect(nextRecommendationSnapshot({ action: 'recommend_retry' }, snapshot)).toBe(snapshot);
    expect(nextRecommendationSnapshot({ action: 'chat' }, snapshot)).toBeNull();
    expect(nextRecommendationSnapshot({ action: 'recommend' }, null)).toBeNull();
  });

  it('buildAgentExecTrace_returnsStableContextFields', () => {
    const trace = buildAgentExecTrace({
      routing: { action: 'play_search' },
      queue: { length: 7, mode: 'sequential' },
    });

    expect(trace).toEqual({
      lastAction: 'play_search',
      queueLength: 7,
      mode: 'sequential',
    });
  });
});
