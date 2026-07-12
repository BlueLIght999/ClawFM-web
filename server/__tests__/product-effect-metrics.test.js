import { describe, it, expect } from 'vitest';
import {
  evaluateProductEffect,
  PRODUCT_EFFECT_CHAINS,
} from '../domain/evaluation/productEffectMetrics.js';
import { productEffectEvalSet } from '../evaluation/productEffectEvalSet.js';

describe('product effect metrics', () => {
  it('evaluateProductEffect_startupAndPlaybackEvents_returnsKeyChainMetrics', () => {
    const report = evaluateProductEffect([
      {
        id: 'smooth-start',
        events: [
          { type: 'page_open', at: 0 },
          { type: 'login_started', at: 100 },
          { type: 'login_success', at: 500 },
          { type: 'playlist_loaded', at: 900 },
          { type: 'profile_ready', at: 1200 },
          { type: 'cold_start_failure', at: 1500 },
          { type: 'fallback_started_music', at: 1800 },
          { type: 'first_song_playing', at: 9000 },
          { type: 'song_ended', at: 120000 },
          { type: 'next_song_started', at: 126000 },
          { type: 'queue_refill_started', at: 130000 },
          { type: 'queue_refill_success', at: 131000 },
        ],
      },
      {
        id: 'silent-gap',
        events: [
          { type: 'page_open', at: 0 },
          { type: 'song_ended', at: 60000 },
          { type: 'next_song_started', at: 76000 },
          { type: 'queue_refill_started', at: 80000 },
        ],
      },
    ]);

    expect(report.chains.startup.metrics.openSuccessRate).toMatchObject({
      numerator: 1,
      denominator: 2,
      value: 0.5,
    });
    expect(report.chains.startup.metrics.medianTimeToFirstSongMs.value).toBe(9000);
    expect(report.chains.startup.metrics.coldStartFallbackRate.value).toBe(1);
    expect(report.chains.playback.metrics.silentInterruptions.value).toBe(1);
    expect(report.chains.playback.metrics.nextSongAdvancementRate.value).toBe(1);
    expect(report.chains.playback.metrics.queueRefillSuccessRate.value).toBe(0.5);
  });

  it('evaluateProductEffect_evalSet_returnsThreeMetricsForEveryProductChain', () => {
    const report = evaluateProductEffect(productEffectEvalSet);

    for (const chain of PRODUCT_EFFECT_CHAINS) {
      expect(Object.keys(report.chains[chain.id].metrics)).toHaveLength(3);
    }
    expect(report.summary.totalChains).toBe(7);
    expect(report.summary.totalMetrics).toBe(21);
    expect(report.summary.attention.length).toBeGreaterThan(0);
    expect(report.chains.recommendation.metrics.recommendationAcceptanceRate.value).toBeLessThan(1);
    expect(report.chains.intervention.metrics.intentActionSuccessRate.value).toBeLessThan(1);
  });

  it('evaluateProductEffect_durationUnderTarget_isNotAnAttentionItem', () => {
    const report = evaluateProductEffect([
      {
        id: 'fast-start',
        events: [
          { type: 'page_open', at: 0 },
          { type: 'first_song_playing', at: 12000 },
        ],
      },
    ]);

    expect(report.summary.attention).not.toContainEqual(
      expect.objectContaining({ metricId: 'medianTimeToFirstSongMs' })
    );
  });
});
