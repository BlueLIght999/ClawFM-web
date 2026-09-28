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
    // Exact sequence, not membership: the label contributes the top-3 by
    // weight first, then the remaining top-N features. A weaker `toContain`
    // check cannot see a reversed sort or a dropped rank.
    expect(kw).toEqual(['rock', 'energetic', 'night']);
    expect(kw).not.toContain('pop');
  });

  it('clusterKeywords_ordersRemainderByDescendingWeight', () => {
    // Distinct magnitudes so the sort order is observable.
    expect(clusterKeywords({ genre_rock: 0.2, genre_pop: 0.9, mood_sad: 0.5 }))
      .toEqual(['pop', 'sad', 'rock']);
  });

  it('clusterKeywords_excludesZeroAndNegativeWeights', () => {
    expect(clusterKeywords({ genre_rock: 1, genre_pop: 0, mood_sad: -0.5 }))
      .toEqual(['rock']);
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

  // ── Regression guards for branches Stryker found unreached ──
  //
  // Each of these covers a defensive path that only fires on malformed or
  // unlabelled data. They matter because a distribution run reads centroids
  // and member lists straight out of stored cluster rows: a null centroid or a
  // missing memberUserIds is a data problem, and the correct response is to
  // degrade (skip the cluster) rather than throw and abort the whole run.

  it('clusterKeywords_handlesNullCentroid', () => {
    expect(clusterKeywords(null)).toEqual([]);
  });

  it('clusterKeywords_returnsEmptyWhenEveryWeightIsNegative', () => {
    // The `> 0` filter feeds both the label and the remainder list. An
    // inverted or `>= 0` comparison would surface garbage keys here, where no
    // other test can see it: the all-positive cases read the same either way.
    expect(clusterKeywords({ genre_rock: -1, mood_sad: -2 })).toEqual([]);
    expect(clusterKeywords({ genre_rock: 0, mood_sad: 0 })).toEqual([]);
  });

  it('clusterKeywords_ordersLabelPartsAheadOfRemainder', () => {
    // The two-pass build -- label parts first, then the stripped feature names
    // -- is the contract. A single merged sort would interleave them, and the
    // dedupe test above cannot see the difference because it only has two keys.
    expect(clusterKeywords({ genre_rock: 0.8, mood_energetic: 0.5, ts_night: 0.3 }))
      .toEqual(['rock', 'energetic', 'night']);
  });

  it('clusterKeywords_keepsUnknownKeysWithNoPrefix', () => {
    // `stripPrefix` falls through to the bare key for anything that is not one
    // of the six known prefixes. Returning '' would silently drop the feature.
    expect(clusterKeywords({ soundtrack: 0.5, artist_top: 0.3 })).toEqual(['soundtrack', 'artist']);
  });

  it('clusterKeywords_keepsPartiallyMatchingPrefixesIntact', () => {
    // 'rock_' and 'style_' both start with letters that appear in the prefix
    // alternation but neither is a real prefix, so the fallback must return the
    // key unchanged. A loosened tail -- the trailing underscore dropped from the
    // regex -- would strip them to 'rock' and 'style' and collide with each
    // other in the dedupe set.
    expect(clusterKeywords({ rock_: 0.9, style_: 0.4 })).toEqual(['rock_', 'style_']);
  });

  it('clusterKeywords_collapsesACrossLoopKeywordCollision', () => {
    // The one shape that exercises the first loop's dedupe. The label is built
    // from `featureToLabelPart`, so `genre_rock` labels as 'rock' and 'mood_sad'
    // labels as 'sad'; a bare key literally named 'rock' or 'sad' then collides
    // with a label part inside the *second* loop and must not be appended again.
    // Without the guard the output gains a duplicate, losing the `Set` contract
    // that `collectRecipients` and the tag matcher both rely on.
    expect(clusterKeywords({ genre_rock: 1, rock: 0.5 })).toEqual(['rock']);
    expect(clusterKeywords({ mood_sad: 1, sad: 0.4, genre_rock: 0.3 })).toEqual(['sad', 'rock']);
  });

  it('clusterKeywords_emitsEachPartOnceWhenLabelAndRemainderOverlap', () => {
    // A centroid of unrecognised keys produces a label identical to the head of
    // the remainder list, so the dedupe is the only thing standing between one
    // keyword and two copies of it.
    const kw = clusterKeywords({ aaa: 0.9, bbb: 0.8, ccc: 0.7, ddd: 0.6, eee: 0.5 });
    expect(kw).toEqual(['aaa', 'bbb', 'ccc', 'ddd', 'eee']);
    expect(new Set(kw).size).toBe(kw.length);
  });

  it('clusterKeywords_ordersTheRemainderAfterADistinctLabel', () => {
    // The label takes 'bbb' and 'ddd'; the remainder list is built from the
    // top-5 by weight, so 'fff' (0.3) and 'eee' (0.2) land after the label
    // parts. The exact sequence pins the label-first, then descending-weight
    // remainder ordering -- a single merged sort would interleave them.
    expect(clusterKeywords({ aaa: 0.1, bbb: 0.9, eee: 0.2, ddd: 0.8, ccc: 0.7, fff: 0.3 }))
      .toEqual(['bbb', 'ddd', 'ccc', 'fff', 'eee']);
  });

  it('clusterKeywords_dedupesKeywordAlsoInLabel', () => {
    // generateClusterLabel picks the top-3 features, so 'rock' appears both in
    // the label and in the top-5 list. It must land in `out` once, and the
    // label's ordering must survive.
    expect(clusterKeywords({ genre_rock: 1, mood_happy: 0.5 })).toEqual(['rock', 'happy']);
  });

  it('clusterKeywords_stripsTheArtistAndTagsAliases', () => {
    // The two renamed prefixes, which no generic genre_/mood_ strip would fix.
    expect(clusterKeywords({ artist_top: 1, user_tags_count: 0.5 })).toEqual(['artist', 'tags']);
  });

  it('clusterKeywords_appliesTheAliasesInTheRemainderLoopToo', () => {
    // The test above cannot see stripPrefix at all: both keys are in the label,
    // and the label path supplies 'artist'/'tags' before the remainder loop ever
    // runs. Ranking them fourth and fifth forces the label to drop them, so only
    // stripPrefix can produce the alias. Emitting the raw 'artist_top' here would
    // leak the vector dimension name into a member-visible cluster label.
    expect(clusterKeywords({ genre_rock: 1, mood_happy: 0.9, ts_night: 0.8, artist_top: 0.7 }))
      .toEqual(['rock', 'happy', 'night', 'artist']);
    expect(clusterKeywords({ genre_rock: 1, mood_happy: 0.9, ts_night: 0.8, user_tags_count: 0.7 }))
      .toEqual(['rock', 'happy', 'night', 'tags']);
  });

  it('clusterKeywords_splitsLabelOnMiddleDot', () => {
    // The label is a '·'-joined string; a wrong separator would leak the whole
    // label in as one keyword.
    const kw = clusterKeywords({ genre_rock: 1, mood_sad: 0.8, region_japanese: 0.6 });
    expect(kw).toEqual(['rock', 'sad', 'japanese']);
  });

  it('matchClustersForContent_handlesNullCentroidOnACluster', () => {
    const clusters = [makeCluster(0, 'rock', null, ['a'])];
    expect(matchClustersForContent({ contentTags: ['rock'], clusters })).toEqual([]);
  });

  it('matchClustersForContent_handlesNullContentTags', () => {
    const clusters = [makeCluster(0, 'rock', { genre_rock: 1 }, ['a'])];
    expect(matchClustersForContent({ contentTags: null, clusters })).toEqual([]);
  });

  it('matchClustersForContent_trimsAndLowercasesTags', () => {
    const clusters = [makeCluster(0, 'rock', { genre_rock: 1 }, ['a'])];
    const matched = matchClustersForContent({ contentTags: ['  ROCK  '], clusters });
    expect(matched).toHaveLength(1);
  });

  it('matchClustersForContent_dropsEmptyTags', () => {
    const clusters = [makeCluster(0, 'rock', { genre_rock: 1 }, ['a'])];
    expect(matchClustersForContent({ contentTags: ['', '   ', null], clusters })).toEqual([]);
  });

  it('matchClustersForContent_ignoresNonArrayContentTags', () => {
    // normalizeTags guards on Array.isArray. Without it a bare string is
    // iterated character by character and a one-character feature name would
    // match; an object throws outright. Both must come back empty instead.
    const clusters = [makeCluster(0, 'rock', { genre_rock: 1 }, ['a'])];
    expect(matchClustersForContent({ contentTags: 'rock', clusters })).toEqual([]);
    expect(matchClustersForContent({ contentTags: 'r', clusters })).toEqual([]);
    expect(matchClustersForContent({ contentTags: {}, clusters })).toEqual([]);
  });

  it('matchClustersForContent_coercesNonStringTags', () => {
    // `String(t || '')` is what keeps a numeric tag from reaching `.trim()` as
    // a number and throwing. The tags table is user-supplied JSON, so a number
    // here is a real input, not a hypothetical.
    const clusters = [makeCluster(0, 'rock', { genre_42: 1 }, ['a'])];
    expect(matchClustersForContent({ contentTags: [42], clusters })).toHaveLength(1);
    expect(matchClustersForContent({ contentTags: [42], clusters: [makeCluster(0, 'rock', { genre_rock: 1 }, ['a'])] }))
      .toEqual([]);
    // null and undefined are dropped rather than stringified to 'null'.
    expect(matchClustersForContent({ contentTags: [null, undefined], clusters })).toEqual([]);
  });

  it('matchClustersForContent_scoresOnlyAgainstStrippedKeywords', () => {
    // The tags are matched against unprefixed keywords, so a prefixed spelling
    // must not score. This pins the stripPrefix call inside the scoring loop.
    const clusters = [makeCluster(0, 'rock', { genre_rock: 1 }, ['a'])];
    expect(matchClustersForContent({ contentTags: ['genre_rock'], clusters })).toEqual([]);
  });

  it('matchClustersForContent_handlesMissingMemberUserIds', () => {
    // A cluster row with no members still scores; it just contributes nobody.
    const clusters = [{ clusterId: 0, label: 'rock', centroid: { genre_rock: 1 } }];
    const matched = matchClustersForContent({ contentTags: ['rock'], clusters });
    expect(matched).toHaveLength(1);
    expect(matched[0].memberUserIds).toEqual([]);
  });

  it('matchClustersForContent_handlesNullClusters', () => {
    expect(matchClustersForContent({ contentTags: ['rock'], clusters: null })).toEqual([]);
  });

  it('matchClustersForContent_floorsMaxClustersAtOne', () => {
    // maxClusters 0 or garbage must not silently return zero clusters.
    const clusters = [makeCluster(0, 'rock', { genre_rock: 1 }, ['a'])];
    expect(matchClustersForContent({ contentTags: ['rock'], clusters, maxClusters: 0 })).toHaveLength(1);
    expect(matchClustersForContent({ contentTags: ['rock'], clusters, maxClusters: 'x' })).toHaveLength(1);
  });

  it('collectRecipients_handlesClusterWithoutMemberList', () => {
    expect(collectRecipients([{ clusterId: 0 }, { memberUserIds: ['a'] }])).toEqual(['a']);
  });

  it('collectRecipients_stringifiesNumericIds', () => {
    expect(collectRecipients([{ memberUserIds: [1, 2] }])).toEqual(['1', '2']);
  });

  it('collectRecipients_collapsesSameIdAcrossIdTypes', () => {
    expect(collectRecipients([{ memberUserIds: [1] }, { memberUserIds: ['1'] }])).toEqual(['1']);
  });
});
