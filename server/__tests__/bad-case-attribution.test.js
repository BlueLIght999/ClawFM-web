import { describe, it, expect } from 'vitest';
import {
  attributeBadCases,
  BAD_CASE_LAYERS,
} from '../domain/evaluation/badCaseAttribution.js';
import { badCaseEvalSet } from '../evaluation/badCaseEvalSet.js';

describe('bad case attribution', () => {
  it('attributeBadCases_entityMismatch_returnsHardBadWithActionAttributionChain', () => {
    const report = attributeBadCases([
      {
        id: 'artist-mismatch',
        events: [
          { type: 'user_intent_submitted', at: 0, text: '放周杰伦的歌' },
          {
            type: 'recommended_song_added',
            at: 1200,
            songId: 'song-1',
            expectedArtist: 'Jay Chou',
            actualArtist: 'JJ Lin',
          },
        ],
      },
    ]);

    expect(report.cases).toHaveLength(1);
    expect(report.cases[0]).toMatchObject({
      layer: BAD_CASE_LAYERS.HARD,
      type: 'entity_mismatch',
      action: 'recommend_song',
      rootCause: 'music_entity_mapping_error',
    });
    expect(report.cases[0].attributionChain).toEqual([
      expect.objectContaining({ stage: 'action', label: 'recommend_song' }),
      expect.objectContaining({ stage: 'signal', label: 'entity_mismatch' }),
      expect.objectContaining({ stage: 'classification', label: BAD_CASE_LAYERS.HARD }),
      expect.objectContaining({ stage: 'rootCause', label: 'music_entity_mapping_error' }),
    ]);
  });

  it('attributeBadCases_skipAloneDoesNotCreateSoftBadUntilNegativeFeedbackAppears', () => {
    const skipOnly = attributeBadCases([
      {
        id: 'skip-only',
        events: [
          { type: 'recommended_song_added', at: 0, songId: 'rec-1', requestedMood: 'relax', songMood: 'metal' },
          { type: 'song_skipped', at: 10000, songId: 'rec-1' },
        ],
      },
    ]);
    const skipWithFeedback = attributeBadCases([
      {
        id: 'skip-with-feedback',
        events: [
          { type: 'recommended_song_added', at: 0, songId: 'rec-1', requestedMood: 'relax', songMood: 'metal' },
          { type: 'song_skipped', at: 10000, songId: 'rec-1' },
          { type: 'user_negative_feedback', at: 16000, targetSongId: 'rec-1', text: '不想听这个' },
        ],
      },
    ]);

    expect(skipOnly.cases).toHaveLength(0);
    expect(skipWithFeedback.cases[0]).toMatchObject({
      layer: BAD_CASE_LAYERS.SOFT,
      type: 'recommendation_mismatch',
      action: 'recommend_song',
      rootCause: 'preference_alignment_gap',
    });
  });

  it('attributeBadCases_safeRefusalRateAboveThreshold_returnsBoundaryBad', () => {
    const report = attributeBadCases([
      {
        id: 'over-conservative',
        events: [
          { type: 'user_intent_submitted', at: 0, safe: true, text: '介绍一下这首歌' },
          { type: 'response_refused', at: 500, canAnswer: true },
          { type: 'user_intent_submitted', at: 1000, safe: true, text: '今天适合听什么' },
          { type: 'response_refused', at: 1500, canAnswer: true },
          { type: 'user_intent_submitted', at: 2000, safe: true, text: '换个风格' },
          { type: 'intent_action_success', at: 2500 },
        ],
      },
    ]);

    expect(report.cases).toHaveLength(1);
    expect(report.cases[0]).toMatchObject({
      layer: BAD_CASE_LAYERS.BOUNDARY,
      type: 'over_conservative',
      action: 'answer_user',
      rootCause: 'safety_threshold_too_strict',
    });
    expect(report.cases[0].evidence.refusalRate).toBe(0.667);
  });

  it('attributeBadCases_evalSet_returnsActionAndRootCauseSummaryAcrossLayers', () => {
    const report = attributeBadCases(badCaseEvalSet);

    expect(report.summary.totalCases).toBeGreaterThanOrEqual(3);
    expect(report.summary.byLayer).toMatchObject({
      hard: expect.any(Number),
      soft: expect.any(Number),
      boundary: expect.any(Number),
    });
    expect(report.summary.byAction.recommend_song).toBeGreaterThan(0);
    expect(report.summary.byRootCause.preference_alignment_gap).toBeGreaterThan(0);
    for (const badCase of report.cases) {
      expect(badCase.attributionChain.map((step) => step.stage)).toEqual([
        'action',
        'signal',
        'classification',
        'rootCause',
      ]);
    }
  });
});
