import { describe, it, expect, vi } from 'vitest';

import {
  RecommendationStrategy,
  ProfileWeightedStrategy,
  DiversityStrategy,
} from '../domain/profile/analyzers/RecommendationStrategy.js';
import { RecommendationEnhancer } from '../domain/profile/analyzers/RecommendationEnhancer.js';
import { AgentContextAnalyzer } from '../domain/profile/analyzers/AgentContextAnalyzer.js';

/**
 * Tests for the profile recommendation & agent-context domain layer.
 *
 * Pure domain logic — no IO, no infrastructure/db/application imports.
 *
 * Coverage:
 * - RecommendationStrategy (base class)
 * - ProfileWeightedStrategy
 * - DiversityStrategy
 * - RecommendationEnhancer
 * - AgentContextAnalyzer
 */

// ─── helpers ───

function makeProfile(overrides = {}) {
  return {
    tags: {
      genre: { rock: { weight: 0.8 }, jazz: { weight: 0.5 } },
      region: { korean: { weight: 0.5 } },
      mood: { happy: { weight: 0.6 } },
    },
    analysis: {
      dailyHabit: { peakPeriod: 'morning' },
      chatStyle: { style: 'casual' },
      emotion: { currentMood: 'excited' },
    },
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// RecommendationStrategy (base class)
// ═══════════════════════════════════════════════════════════════

describe('RecommendationStrategy (base class)', () => {
  it('name_baseClass_throwsNotImplemented', () => {
    const strategy = new RecommendationStrategy();
    expect(() => strategy.name).toThrow('Not implemented');
  });

  it('enhance_baseClass_throwsNotImplemented', () => {
    const strategy = new RecommendationStrategy();
    expect(() => strategy.enhance([], {})).toThrow('Not implemented');
  });
});

// ═══════════════════════════════════════════════════════════════
// ProfileWeightedStrategy
// ═══════════════════════════════════════════════════════════════

describe('ProfileWeightedStrategy', () => {
  it('name_returnsProfileWeighted', () => {
    const strategy = new ProfileWeightedStrategy();
    expect(strategy.name).toBe('profile_weighted');
  });

  it('enhance_emptySongs_returnsEmpty', () => {
    const strategy = new ProfileWeightedStrategy();
    const result = strategy.enhance([], makeProfile());
    expect(result).toEqual([]);
  });

  it('enhance_nullSongs_returnsNull', () => {
    const strategy = new ProfileWeightedStrategy();
    const result = strategy.enhance(null, makeProfile());
    expect(result).toBeNull();
  });

  it('enhance_noProfileTags_returnsSongsUnchanged', () => {
    const strategy = new ProfileWeightedStrategy();
    const songs = [{ title: 'A', artist: 'X' }];
    const result = strategy.enhance(songs, {});
    expect(result).toBe(songs);
  });

  it('enhance_genreMatch_sortsByGenreScore', () => {
    const strategy = new ProfileWeightedStrategy();
    const profile = { tags: { genre: { rock: { weight: 0.8 } } } };
    const songs = [
      { title: 'Pop Song', artist: 'Pop Singer' },
      { title: 'Rock Anthem', artist: 'Rock Band' },
    ];
    const result = strategy.enhance(songs, profile);
    expect(result[0].artist).toBe('Rock Band');
    expect(result[0]._profileScore).toBeCloseTo(0.8, 5);
    expect(result[1].artist).toBe('Pop Singer');
    expect(result[1]._profileScore).toBe(0);
  });

  it('enhance_genreMatchInTitle_scoresByTitle', () => {
    const strategy = new ProfileWeightedStrategy();
    const profile = { tags: { genre: { jazz: { weight: 0.5 } } } };
    const songs = [
      { title: 'Normal Song', artist: 'Unknown' },
      { title: 'Jazz Night', artist: 'Someone' },
    ];
    const result = strategy.enhance(songs, profile);
    expect(result[0].title).toBe('Jazz Night');
    expect(result[0]._profileScore).toBeCloseTo(0.5, 5);
  });

  it('enhance_regionMatch_appliesRegionWeightMultiplier', () => {
    const strategy = new ProfileWeightedStrategy();
    const profile = { tags: { region: { korean: { weight: 0.5 } } } };
    const songs = [
      { title: 'US Song', artist: 'American Singer' },
      { title: 'K-Pop Hit', artist: 'Korean Star' },
    ];
    const result = strategy.enhance(songs, profile);
    expect(result[0].artist).toBe('Korean Star');
    expect(result[0]._profileScore).toBeCloseTo(0.5 * 0.8, 5);
    expect(result[1]._profileScore).toBe(0);
  });

  it('enhance_moodAlignmentWithContext_addsMoodScore', () => {
    const strategy = new ProfileWeightedStrategy();
    const profile = {
      tags: {
        genre: { rock: { weight: 0.8 } },
        mood: { happy: { weight: 0.6 } },
      },
    };
    const context = { currentMood: 'happy' };
    const songs = [
      { title: 'Pop', artist: 'Pop Singer' },
      { title: 'Rock', artist: 'Rock Band' },
    ];
    const result = strategy.enhance(songs, profile, context);
    // Rock Band: genre 0.8 + mood 0.6*0.5 = 1.1
    expect(result[0].artist).toBe('Rock Band');
    expect(result[0]._profileScore).toBeCloseTo(1.1, 5);
    // Pop Singer: genre 0 + mood 0.6*0.5 = 0.3
    expect(result[1]._profileScore).toBeCloseTo(0.3, 5);
  });

  it('enhance_moodWithoutContext_doesNotAddMoodScore', () => {
    const strategy = new ProfileWeightedStrategy();
    const profile = {
      tags: {
        genre: { rock: { weight: 0.8 } },
        mood: { happy: { weight: 0.6 } },
      },
    };
    const songs = [
      { title: 'Pop', artist: 'Pop Singer' },
      { title: 'Rock', artist: 'Rock Band' },
    ];
    const result = strategy.enhance(songs, profile);
    // No context.currentMood → no mood bonus
    expect(result[0].artist).toBe('Rock Band');
    expect(result[0]._profileScore).toBeCloseTo(0.8, 5);
    expect(result[1]._profileScore).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// DiversityStrategy
// ═══════════════════════════════════════════════════════════════

describe('DiversityStrategy', () => {
  it('name_returnsDiversity', () => {
    const strategy = new DiversityStrategy();
    expect(strategy.name).toBe('diversity');
  });

  it('enhance_multipleArtists_interleavesThem', () => {
    const strategy = new DiversityStrategy();
    const songs = [
      { artist: 'A', title: '1' },
      { artist: 'A', title: '2' },
      { artist: 'B', title: '3' },
      { artist: 'B', title: '4' },
    ];
    const result = strategy.enhance(songs);
    expect(result.map((s) => s.artist)).toEqual(['A', 'B', 'A', 'B']);
  });

  it('enhance_singleArtist_keepsSameOrder', () => {
    const strategy = new DiversityStrategy();
    const songs = [
      { artist: 'A', title: '1' },
      { artist: 'A', title: '2' },
      { artist: 'A', title: '3' },
    ];
    const result = strategy.enhance(songs);
    expect(result.map((s) => s.title)).toEqual(['1', '2', '3']);
  });

  it('enhance_emptyArray_returnsEmpty', () => {
    const strategy = new DiversityStrategy();
    const result = strategy.enhance([]);
    expect(result).toEqual([]);
  });

  it('enhance_singleSong_returnsSameReference', () => {
    const strategy = new DiversityStrategy();
    const songs = [{ artist: 'A', title: '1' }];
    const result = strategy.enhance(songs);
    expect(result).toBe(songs);
  });

  it('enhance_threeArtists_roundRobinsAll', () => {
    const strategy = new DiversityStrategy();
    const songs = [
      { artist: 'A', title: '1' },
      { artist: 'A', title: '2' },
      { artist: 'B', title: '3' },
      { artist: 'C', title: '4' },
    ];
    const result = strategy.enhance(songs);
    expect(result.map((s) => s.artist)).toEqual(['A', 'B', 'C', 'A']);
  });
});

// ═══════════════════════════════════════════════════════════════
// RecommendationEnhancer
// ═══════════════════════════════════════════════════════════════

describe('RecommendationEnhancer', () => {
  it('analyze_emptySongs_returnsNoneStrategy', async () => {
    const enhancer = new RecommendationEnhancer();
    const result = await enhancer.analyze(makeProfile(), { songs: [] });
    expect(result.enhanced).toEqual([]);
    expect(result.strategy).toBe('none');
    expect(result.improvements).toBe(0);
  });

  it('analyze_noSongsOption_returnsNoneStrategy', async () => {
    const enhancer = new RecommendationEnhancer();
    const result = await enhancer.analyze(makeProfile());
    expect(result.enhanced).toEqual([]);
    expect(result.strategy).toBe('none');
  });

  it('analyze_withSongs_appliesMultipleStrategies', async () => {
    const enhancer = new RecommendationEnhancer();
    const profile = { tags: { genre: { rock: { weight: 0.8 } } } };
    const songs = [
      { title: 'Pop', artist: 'Pop Singer' },
      { title: 'Rock', artist: 'Rock Band' },
    ];
    const result = await enhancer.analyze(profile, { songs });
    expect(result.strategies).toContain('profile_weighted');
    expect(result.strategies).toContain('diversity');
    expect(result.originalCount).toBe(2);
    expect(result.enhancedCount).toBe(2);
  });

  it('analyze_withMatchingSongs_returnsZeroImprovements', async () => {
    const enhancer = new RecommendationEnhancer();
    const profile = { tags: { genre: { rock: { weight: 0.8 } } } };
    const songs = [
      { title: 'Pop', artist: 'Pop Singer' },
      { title: 'Rock', artist: 'Rock Band' },
    ];
    const result = await enhancer.analyze(profile, { songs });
    // Reordering does not add/remove matches → 0 improvement
    expect(result.improvements).toBe(0);
  });

  it('calculateImprovements_differentMatchCounts_returnsDifference', () => {
    const enhancer = new RecommendationEnhancer();
    const profile = { tags: { genre: { rock: { weight: 0.8 } } } };
    const original = [{ artist: 'Pop Singer' }];
    const enhanced = [{ artist: 'Rock Band' }, { artist: 'Pop Singer' }];
    expect(enhancer._calculateImprovements(original, enhanced, profile)).toBe(1);
  });

  it('calculateImprovements_noGenreTags_returnsZero', () => {
    const enhancer = new RecommendationEnhancer();
    const profile = { tags: { mood: { happy: { weight: 0.5 } } } };
    expect(enhancer._calculateImprovements([], [], profile)).toBe(0);
  });

  it('enhanceSongs_convenienceMethod_returnsEnhanced', () => {
    const enhancer = new RecommendationEnhancer();
    const profile = { tags: { genre: { rock: { weight: 0.8 } } } };
    const songs = [
      { title: 'Pop', artist: 'Pop Singer' },
      { title: 'Rock', artist: 'Rock Band' },
    ];
    const result = enhancer.enhanceSongs(songs, profile);
    expect(result).toHaveLength(2);
    expect(result[0].artist).toBe('Rock Band');
    expect(result[0]._profileScore).toBeDefined();
  });

  it('enhanceSongs_emptySongs_returnsEmpty', () => {
    const enhancer = new RecommendationEnhancer();
    const result = enhancer.enhanceSongs([], makeProfile());
    expect(result).toHaveLength(0);
  });

  it('analyze_withEventBus_emitsAnalysisCompleted', async () => {
    const bus = { emit: vi.fn() };
    const enhancer = new RecommendationEnhancer({ eventBus: bus });
    const profile = { tags: { genre: { rock: { weight: 0.8 } } } };
    const songs = [{ title: 'Rock', artist: 'Rock Band' }];

    await enhancer.analyze(profile, { songs });

    expect(bus.emit).toHaveBeenCalledWith(
      'analysis:completed',
      expect.objectContaining({ type: 'recommendation' }),
    );
  });

  it('constructor_customStrategies_usesProvidedStrategies', async () => {
    const customStrategy = {
      name: 'custom',
      enhance: vi.fn((songs) => songs),
    };
    const enhancer = new RecommendationEnhancer({ strategies: [customStrategy] });
    const songs = [{ title: 'A', artist: 'X' }];

    await enhancer.analyze(makeProfile(), { songs });

    expect(customStrategy.enhance).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// AgentContextAnalyzer
// ═══════════════════════════════════════════════════════════════

describe('AgentContextAnalyzer', () => {
  it('analyze_emptyProfile_returnsDefaults', async () => {
    const analyzer = new AgentContextAnalyzer();
    const result = await analyzer.analyze(null);
    expect(result.summary).toBe('');
    expect(result.topGenres).toEqual([]);
    expect(result.topMoods).toEqual([]);
    expect(result.listeningHabit).toBeNull();
    expect(result.chatStyle).toBeNull();
  });

  it('analyze_withProfile_extractsTopGenres', async () => {
    const analyzer = new AgentContextAnalyzer();
    const profile = {
      tags: {
        genre: {
          rock: { weight: 0.9 },
          jazz: { weight: 0.6 },
          pop: { weight: 0.3 },
        },
      },
    };
    const result = await analyzer.analyze(profile);
    expect(result.topGenres).toEqual(['rock', 'jazz', 'pop']);
  });

  it('analyze_topGenresRespectsLimit', async () => {
    const analyzer = new AgentContextAnalyzer();
    const profile = {
      tags: {
        genre: {
          rock: { weight: 0.9 },
          jazz: { weight: 0.6 },
          pop: { weight: 0.3 },
          blues: { weight: 0.2 },
          folk: { weight: 0.1 },
          electronic: { weight: 0.05 },
        },
      },
    };
    const result = await analyzer.analyze(profile);
    expect(result.topGenres).toHaveLength(5);
    expect(result.topGenres[0]).toBe('rock');
  });

  it('analyze_withFullProfile_buildsSummaryWithAllComponents', async () => {
    const analyzer = new AgentContextAnalyzer();
    const result = await analyzer.analyze(makeProfile());

    expect(result.summary).toContain('偏好流派: rock、jazz');
    expect(result.summary).toContain('当前情绪: happy');
    expect(result.summary).toContain('活跃时段: 早晨');
    expect(result.summary).toContain('交流风格: casual');
    expect(result.summary).toContain('情绪状态: excited');
    expect(result.topGenres).toContain('rock');
    expect(result.topMoods).toContain('happy');
    expect(result.topRegions).toContain('korean');
    expect(result.listeningHabit).toEqual({ peakPeriod: 'morning' });
    expect(result.chatStyle).toEqual({ style: 'casual' });
    expect(result.emotion).toEqual({ currentMood: 'excited' });
  });

  it('analyze_withPartialData_buildsPartialSummary', async () => {
    const analyzer = new AgentContextAnalyzer();
    const profile = {
      tags: {
        genre: { rock: { weight: 0.8 } },
      },
    };
    const result = await analyzer.analyze(profile);
    expect(result.summary).toContain('偏好流派: rock');
    expect(result.summary).not.toContain('当前情绪');
    expect(result.summary).not.toContain('活跃时段');
    expect(result.summary).not.toContain('交流风格');
    expect(result.listeningHabit).toBeNull();
    expect(result.chatStyle).toBeNull();
  });

  it('analyze_withEventBus_emitsAnalysisCompleted', async () => {
    const bus = { emit: vi.fn() };
    const analyzer = new AgentContextAnalyzer({ eventBus: bus });

    await analyzer.analyze(makeProfile());

    expect(bus.emit).toHaveBeenCalledWith(
      'analysis:completed',
      expect.objectContaining({ type: 'agent_context' }),
    );
  });

  it('analyze_unknownPeakPeriod_usesRawValue', async () => {
    const analyzer = new AgentContextAnalyzer();
    const profile = {
      tags: { genre: { rock: { weight: 0.8 } } },
      analysis: {
        dailyHabit: { peakPeriod: 'dawn' },
      },
    };
    const result = await analyzer.analyze(profile);
    expect(result.summary).toContain('活跃时段: dawn');
  });
});
