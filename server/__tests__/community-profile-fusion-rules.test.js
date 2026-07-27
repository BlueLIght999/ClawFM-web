import { describe, expect, it } from 'vitest';
import {
  fuseProfile,
  normalizeWeights,
  blendCounts,
  normalizeArtistAffinity,
  normalizeSelfTags,
  hourToSlot,
  aggregateRadioSignals,
  GENRE_TAGS,
  TIME_SLOTS,
} from '../domain/community/profileFusionRules.js';

describe('community profile fusion rules', () => {
  it('normalizeWeights_producesDistributionOverTagList', () => {
    const w = normalizeWeights({ rock: 3, pop: 1 }, GENRE_TAGS);
    expect(w.rock).toBeCloseTo(0.75, 6);
    expect(w.pop).toBeCloseTo(0.25, 6);
    expect(w.jazz).toBe(0);
    // sums to 1 over the listed counts
    const sumListed = GENRE_TAGS.reduce((s, t) => s + w[t], 0);
    expect(sumListed).toBeCloseTo(1, 6);
  });

  it('normalizeWeights_returnsAllZerosWhenTotalZero', () => {
    const w = normalizeWeights({}, TIME_SLOTS);
    for (const t of TIME_SLOTS) expect(w[t]).toBe(0);
  });

  it('normalizeWeights_handlesNullAndUndefinedCounts', () => {
    expect(() => normalizeWeights(null, GENRE_TAGS)).not.toThrow();
    expect(() => normalizeWeights(undefined, GENRE_TAGS)).not.toThrow();
  });

  it('blendCounts_weightedRawBlend', () => {
    const blended = blendCounts({ rock: 10 }, { rock: 4, jazz: 8 }, 0.7, 0.3);
    expect(blended.rock).toBeCloseTo(10 * 0.7 + 4 * 0.3, 6);
    expect(blended.jazz).toBeCloseTo(8 * 0.3, 6);
  });

  it('normalizeArtistAffinity_normalizesByTotalAndSortsDesc', () => {
    const aff = normalizeArtistAffinity([
      { name: 'Coldplay', playCount: 30 },
      { name: '周杰伦', playCount: 70 },
    ]);
    expect(aff[0].artist).toBe('周杰伦');
    expect(aff[0].weight).toBeCloseTo(0.7, 6);
    expect(aff[1].artist).toBe('Coldplay');
    expect(aff[1].weight).toBeCloseTo(0.3, 6);
  });

  it('normalizeArtistAffinity_returnsEmptyWhenNoPlays', () => {
    expect(normalizeArtistAffinity([])).toEqual([]);
    expect(normalizeArtistAffinity([{ name: 'x', playCount: 0 }])).toEqual([]);
  });

  it('normalizeArtistAffinity_dedupsAndTrimsAndCapsAtTen', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ name: `artist${i}`, playCount: 15 - i }));
    const aff = normalizeArtistAffinity(many);
    expect(aff.length).toBe(10);
    expect(aff[0].artist).toBe('artist0');
  });

  it('normalizeSelfTags_dedupsTrimsAndWeightOne', () => {
    const tags = normalizeSelfTags([' 通勤 ', '学习', '通勤', '', '  ']);
    expect(tags).toEqual([
      { tag: '通勤', weight: 1 },
      { tag: '学习', weight: 1 },
    ]);
  });

  it('fuseProfile_blendsGenreWithNeteaseHeavy', () => {
    const fused = fuseProfile({
      neteaseSignals: { genreCounts: { rock: 10 } },
      radioSignals: { genreCounts: { jazz: 10 } },
    });
    // blended raw: rock=10*0.7=7, jazz=10*0.3=3 → rock 0.7, jazz 0.3
    expect(fused.tags.genre.rock).toBeCloseTo(0.7, 6);
    expect(fused.tags.genre.jazz).toBeCloseTo(0.3, 6);
  });

  it('fuseProfile_moodFromRadioOnly', () => {
    const fused = fuseProfile({
      radioSignals: { moodCounts: { happy: 3, calm: 1 } },
    });
    expect(fused.tags.mood.happy).toBeCloseTo(0.75, 6);
    expect(fused.tags.mood.calm).toBeCloseTo(0.25, 6);
  });

  it('fuseProfile_artistAffinityAndMetaFromNetease', () => {
    const fused = fuseProfile({
      neteaseSignals: {
        topArtists: [{ name: 'A', playCount: 4 }, { name: 'B', playCount: 1 }],
        totalPlays: 200,
      },
    });
    expect(fused.artistAffinity[0]).toEqual({ artist: 'A', weight: 0.8 });
    expect(fused.meta.totalPlays).toBe(200);
    expect(fused.meta.source).toBe('P-B');
  });

  it('fuseProfile_timeSlotPrefersNeteaseOverRadio', () => {
    const fused = fuseProfile({
      neteaseSignals: { timeSlotCounts: { night: 5 } },
      radioSignals: { timeSlotCounts: { morning: 5 } },
    });
    expect(fused.timeSlot.night).toBeCloseTo(1, 6);
    expect(fused.timeSlot.morning).toBe(0);
  });

  it('fuseProfile_timeSlotFallsBackToRadioWhenNeteaseMissing', () => {
    const fused = fuseProfile({
      radioSignals: { timeSlotCounts: { morning: 5 } },
    });
    expect(fused.timeSlot.morning).toBeCloseTo(1, 6);
  });

  it('fuseProfile_userTagsFromSelfTags', () => {
    const fused = fuseProfile({ selfTags: ['通勤', '失恋'] });
    expect(fused.userTags).toEqual([
      { tag: '通勤', weight: 1 },
      { tag: '失恋', weight: 1 },
    ]);
  });

  it('fuseProfile_handlesAllEmptyInputsReturningZeroProfile', () => {
    const fused = fuseProfile({});
    expect(fused.tags.genre.rock).toBe(0);
    expect(fused.tags.mood.happy).toBe(0);
    expect(fused.artistAffinity).toEqual([]);
    expect(fused.userTags).toEqual([]);
    expect(fused.meta.totalPlays).toBe(0);
    expect(fused.meta.source).toBe('P-B');
  });

  it('fuseProfile_handlesUndefinedArgs', () => {
    expect(() => fuseProfile()).not.toThrow();
    expect(() => fuseProfile(undefined)).not.toThrow();
  });
});

describe('community radio signals aggregation', () => {
  it('hourToSlot_mapsHoursToCorrectSlot', () => {
    expect(hourToSlot(0)).toBe('late_night');
    expect(hourToSlot(4)).toBe('late_night');
    expect(hourToSlot(5)).toBe('morning');
    expect(hourToSlot(10)).toBe('morning');
    expect(hourToSlot(11)).toBe('afternoon');
    expect(hourToSlot(16)).toBe('afternoon');
    expect(hourToSlot(17)).toBe('evening');
    expect(hourToSlot(22)).toBe('evening');
    expect(hourToSlot(23)).toBe('night');
  });

  it('hourToSlot_returnsNullForInvalid', () => {
    expect(hourToSlot(-1)).toBeNull();
    expect(hourToSlot(24)).toBeNull();
    expect(hourToSlot('x')).toBeNull();
    expect(hourToSlot(null)).toBeNull();
  });

  it('aggregateRadioSignals_derivesBehaviorFromActions', () => {
    // 用本地时间格式（无 Z），避免时区换算导致 hour 偏移
    const signals = aggregateRadioSignals([
      { action: 'liked', artist: 'A', playedAt: '2026-07-20T20:00:00' },
      { action: 'liked', artist: 'A', playedAt: '2026-07-20T21:00:00' },
      { action: 'skipped', artist: 'B', playedAt: '2026-07-20T09:00:00' },
    ]);
    expect(signals.behaviorCounts.skip_prone).toBe(1);
    expect(signals.behaviorCounts.replay_lover).toBe(2);
    expect(signals.behaviorCounts.explorer).toBe(1); // B appears once
    expect(signals.behaviorCounts.loyalist).toBe(1); // A appears twice
    expect(signals.behaviorCounts.morning_person).toBe(1); // 09:00
    expect(signals.behaviorCounts.night_owl).toBe(0); // 20:00/21:00 是 evening，不算 night_owl
  });

  it('aggregateRadioSignals_bucketsTimeSlotsFromPlayedAt', () => {
    const signals = aggregateRadioSignals([
      { action: 'liked', artist: 'A', playedAt: '2026-07-20 09:00:00' },
      { action: 'liked', artist: 'A', playedAt: '2026-07-20 20:00:00' },
      { action: 'liked', artist: 'A', playedAt: '2026-07-20 02:00:00' },
    ]);
    expect(signals.timeSlotCounts.morning).toBe(1);
    expect(signals.timeSlotCounts.evening).toBe(1);
    expect(signals.timeSlotCounts.late_night).toBe(1);
  });

  it('aggregateRadioSignals_leavesGenreMoodChatEmpty', () => {
    const signals = aggregateRadioSignals([{ action: 'liked', artist: 'A', playedAt: '2026-07-20T20:00:00Z' }]);
    expect(signals.genreCounts).toEqual({});
    expect(signals.moodCounts).toEqual({});
    expect(signals.chatStyleCounts).toEqual({});
  });

  it('aggregateRadioSignals_handlesEmptyAndMalformed', () => {
    expect(() => aggregateRadioSignals([])).not.toThrow();
    expect(() => aggregateRadioSignals(null)).not.toThrow();
    const s = aggregateRadioSignals([{ action: 'liked' /* no artist, no playedAt */ }]);
    expect(s.behaviorCounts.replay_lover).toBe(1);
    expect(s.timeSlotCounts.morning).toBe(0);
  });
});
