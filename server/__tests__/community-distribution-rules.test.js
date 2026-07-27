import { describe, expect, it } from 'vitest';
import {
  matchClustersForContent,
  collectRecipients,
  clusterKeywords,
} from '../domain/community/distributionRules.js';

function makeCluster(clusterId, label, centroid, memberUserIds) {
  return { clusterId, label, centroid, memberUserIds, memberCount: memberUserIds.length };
}

describe('community distribution rules', () => {
  it('clusterKeywords_extractsTopFeaturesFromCentroid', () => {
    const kw = clusterKeywords({ genre_rock: 0.8, mood_energetic: 0.5, ts_night: 0.3, genre_pop: 0 });
    expect(kw).toContain('rock');
    expect(kw).toContain('energetic');
    expect(kw).toContain('night');
    expect(kw).not.toContain('pop');
  });

  it('clusterKeywords_returnsEmptyForAllZero', () => {
    expect(clusterKeywords({})).toEqual([]);
    expect(clusterKeywords(null)).toEqual([]);
  });

  it('matchClustersForContent_scoresByTagOverlap', () => {
    const clusters = [
      makeCluster(0, 'rock·night·energetic', { genre_rock: 1, mood_energetic: 1, ts_night: 1 }, ['a', 'b']),
      makeCluster(1, 'pop·happy', { genre_pop: 1, mood_happy: 1 }, ['c']),
    ];
    const matched = matchClustersForContent({ contentTags: ['rock'], clusters });
    expect(matched.length).toBe(1);
    expect(matched[0].clusterId).toBe(0);
    expect(matched[0].score).toBe(1);
  });

  it('matchClustersForContent_sortsByScoreDesc', () => {
    const clusters = [
      makeCluster(0, 'rock', { genre_rock: 1 }, ['a']),
      makeCluster(1, 'rock·indie', { genre_rock: 1, genre_indie: 1 }, ['b']),
    ];
    const matched = matchClustersForContent({ contentTags: ['rock', 'indie'], clusters });
    expect(matched[0].clusterId).toBe(1); // 2 matches
    expect(matched[1].clusterId).toBe(0); // 1 match
  });

  it('matchClustersForContent_respectsMaxClusters', () => {
    const clusters = [
      makeCluster(0, 'rock', { genre_rock: 1 }, ['a']),
      makeCluster(1, 'rock', { genre_rock: 1 }, ['b']),
      makeCluster(2, 'rock', { genre_rock: 1 }, ['c']),
      makeCluster(3, 'rock', { genre_rock: 1 }, ['d']),
    ];
    const matched = matchClustersForContent({ contentTags: ['rock'], clusters, maxClusters: 2 });
    expect(matched.length).toBe(2);
  });

  it('matchClustersForContent_returnsEmptyWhenNoMatch', () => {
    const clusters = [makeCluster(0, 'pop', { genre_pop: 1 }, ['a'])];
    expect(matchClustersForContent({ contentTags: ['metal'], clusters })).toEqual([]);
  });

  it('matchClustersForContent_returnsEmptyWhenNoTags', () => {
    expect(matchClustersForContent({ contentTags: [], clusters: [makeCluster(0, 'pop', {}, ['a'])] })).toEqual([]);
  });

  it('matchClustersForContent_caseInsensitive', () => {
    const clusters = [makeCluster(0, 'rock', { genre_rock: 1 }, ['a'])];
    const matched = matchClustersForContent({ contentTags: ['ROCK'], clusters });
    expect(matched.length).toBe(1);
  });

  it('collectRecipients_dedupesUserIds', () => {
    const matched = [
      { memberUserIds: ['a', 'b'] },
      { memberUserIds: ['b', 'c'] },
    ];
    expect(collectRecipients(matched).sort()).toEqual(['a', 'b', 'c']);
  });

  it('collectRecipients_handlesEmpty', () => {
    expect(collectRecipients([])).toEqual([]);
    expect(collectRecipients(null)).toEqual([]);
  });
});
