import { describe, it, expect, vi } from 'vitest';

import { WeightStrategy, DefaultWeightStrategy } from '../domain/profile/builders/WeightStrategy.js';
import { DecayStrategy, EbbinghausDecayStrategy } from '../domain/profile/builders/DecayStrategy.js';
import { TagWeightBuilder } from '../domain/profile/builders/TagWeightBuilder.js';
import { SchemaMigrator, schemaMigrator } from '../domain/profile/builders/SchemaMigrator.js';

/**
 * Tests for the profile builder domain layer — pure domain logic with
 * no IO, no infrastructure/db/application imports.
 *
 * Coverage:
 * - WeightStrategy / DefaultWeightStrategy
 * - DecayStrategy / EbbinghausDecayStrategy
 * - TagWeightBuilder
 * - SchemaMigrator
 */

// ─── helpers ───

const NOW_ISO = () => new Date().toISOString();
const weeksAgoIso = (n) => new Date(Date.now() - n * 7 * 24 * 60 * 60 * 1000).toISOString();

// ─── WeightStrategy ───

describe('WeightStrategy (base class)', () => {
  it('name_baseClass_throwsNotImplemented', () => {
    const strategy = new WeightStrategy();
    expect(() => strategy.name).toThrow('Not implemented');
  });

  it('calculate_baseClass_throwsNotImplemented', () => {
    const strategy = new WeightStrategy();
    expect(() => strategy.calculate([], {})).toThrow('Not implemented');
  });
});

describe('DefaultWeightStrategy', () => {
  it('name_returnsDefault', () => {
    const strategy = new DefaultWeightStrategy();
    expect(strategy.name).toBe('default');
  });

  it('calculate_emptyEvidence_returnsZero', () => {
    const strategy = new DefaultWeightStrategy();
    expect(strategy.calculate([])).toBe(0);
    expect(strategy.calculate(null)).toBe(0);
    expect(strategy.calculate(undefined)).toBe(0);
  });

  it('calculate_highFrequency_capsFreqScoreAtOne', () => {
    const strategy = new DefaultWeightStrategy();
    // 15 items → freqScore capped at 1.0; current timestamp → recency 1.0;
    // default confidence 0.7; no skipRate → penalty 1.0
    const evidence = Array.from({ length: 15 }, () => ({ playedAt: NOW_ISO() }));
    expect(strategy.calculate(evidence)).toBeCloseTo(1.0 * 1.0 * 0.7, 5);

    // 5 items → freqScore = 0.5, should be strictly lower
    const five = Array.from({ length: 5 }, () => ({ playedAt: NOW_ISO() }));
    expect(strategy.calculate(five)).toBeCloseTo(0.5 * 1.0 * 0.7, 5);
  });

  it('calculate_oldTimestamp_appliesRecencyDecay', () => {
    const strategy = new DefaultWeightStrategy();
    const evidence = [{ playedAt: weeksAgoIso(10) }];
    // freqScore = 0.1, recencyScore = 0.95^10, confScore = 0.7
    const expected = 0.1 * Math.pow(0.95, 10) * 0.7;
    const result = strategy.calculate(evidence);
    expect(result).toBeCloseTo(expected, 5);
    expect(result).toBeLessThan(0.1 * 1.0 * 0.7); // less than if recency were 1.0
  });

  it('calculate_missingTimestamp_treatsAsCurrent', () => {
    const strategy = new DefaultWeightStrategy();
    const evidence = [{ confidence: 0.8 }]; // no playedAt, no timestamp
    // weeksSince(undefined) → 0 → recencyScore = 1.0
    const expected = 0.1 * 1.0 * 0.8;
    expect(strategy.calculate(evidence)).toBeCloseTo(expected, 5);
  });

  it('calculate_highSkipRate_reducesWeight', () => {
    const strategy = new DefaultWeightStrategy();
    const evidence = Array.from({ length: 5 }, () => ({ playedAt: NOW_ISO() }));

    const withoutSkip = strategy.calculate(evidence, {});
    // skipPenalty = 1 (no skipRate)
    expect(withoutSkip).toBeCloseTo(0.5 * 1.0 * 0.7 * 1, 5);

    const withSkip = strategy.calculate(evidence, { skipRate: 0.8 });
    // skipPenalty = 1 - 0.8 * 0.5 = 0.6
    expect(withSkip).toBeCloseTo(0.5 * 1.0 * 0.7 * 0.6, 5);
    expect(withSkip).toBeLessThan(withoutSkip);
  });

  it('calculate_mixedConfidence_averagesCorrectly', () => {
    const strategy = new DefaultWeightStrategy();

    const lowConf = [{ confidence: 0.5 }, { confidence: 0.9 }];
    // confScore = 0.7, freqScore = 0.2, recencyScore = 1.0
    expect(strategy.calculate(lowConf)).toBeCloseTo(0.2 * 1.0 * 0.7, 5);

    const highConf = [{ confidence: 0.9 }, { confidence: 0.9 }];
    // confScore = 0.9
    expect(strategy.calculate(highConf)).toBeCloseTo(0.2 * 1.0 * 0.9, 5);
  });
});

// ─── DecayStrategy ───

describe('DecayStrategy (base class)', () => {
  it('decay_baseClass_throwsNotImplemented', () => {
    const strategy = new DecayStrategy();
    expect(() => strategy.decay(0.5, {})).toThrow('Not implemented');
  });
});

describe('EbbinghausDecayStrategy', () => {
  it('name_returnsEbbinghaus', () => {
    const strategy = new EbbinghausDecayStrategy();
    expect(strategy.name).toBe('ebbinghaus');
  });

  it('decay_zeroDays_returnsWeightUnchanged', () => {
    const strategy = new EbbinghausDecayStrategy();
    expect(strategy.decay(0.8, { daysSinceLastSeen: 0 })).toBe(0.8);
    expect(strategy.decay(0.8, {})).toBe(0.8);
    expect(strategy.decay(0.8, { daysSinceLastSeen: undefined })).toBe(0.8);
  });

  it('decay_atHalfLife_halvesWeight', () => {
    const strategy = new EbbinghausDecayStrategy({ halfLifeDays: 30 });
    // 30 days / 30 halfLife = 1 → decayFactor = 0.5^1 = 0.5
    expect(strategy.decay(0.8, { daysSinceLastSeen: 30 })).toBeCloseTo(0.4, 5);
  });

  it('decay_customHalfLife_usesProvidedValue', () => {
    const defaultStrategy = new EbbinghausDecayStrategy(); // halfLifeDays = 30
    const customStrategy = new EbbinghausDecayStrategy({ halfLifeDays: 10 });

    const defaultResult = defaultStrategy.decay(1.0, { daysSinceLastSeen: 10 });
    // 0.5^(10/30) ≈ 0.7937
    expect(defaultResult).toBeCloseTo(Math.pow(0.5, 10 / 30), 5);

    const customResult = customStrategy.decay(1.0, { daysSinceLastSeen: 10 });
    // 0.5^(10/10) = 0.5
    expect(customResult).toBeCloseTo(0.5, 5);

    // Shorter half-life → faster decay
    expect(customResult).toBeLessThan(defaultResult);
  });
});

// ─── TagWeightBuilder ───

describe('TagWeightBuilder', () => {
  it('build_withExplicitTags_groupsByDimensionAndName', () => {
    const builder = new TagWeightBuilder();
    const evidence = [
      { tags: [{ dimension: 'genre', name: 'rock', confidence: 0.8 }], playedAt: '2026-01-01T00:00:00Z' },
      { tags: [{ dimension: 'genre', name: 'rock', confidence: 0.9 }], playedAt: '2026-01-02T00:00:00Z' },
      { tags: [{ dimension: 'mood', name: 'happy', confidence: 0.7 }], playedAt: '2026-01-03T00:00:00Z' },
    ];

    const result = builder.build(evidence);

    expect(result.tags.genre.rock).toBeDefined();
    expect(result.tags.genre.rock.evidenceCount).toBe(2);
    expect(result.tags.mood.happy).toBeDefined();
    expect(result.tags.mood.happy.evidenceCount).toBe(1);
    expect(result.schemaVersion).toBe(1);
    expect(result.builtAt).toEqual(expect.any(String));
  });

  it('build_listenEvidence_infersGenreTagFromArtist', () => {
    const builder = new TagWeightBuilder();
    const evidence = [{ type: 'listen', artist: 'Radiohead', playedAt: '2026-01-01T00:00:00Z' }];

    const result = builder.build(evidence);

    expect(result.tags.genre.radiohead).toBeDefined();
    expect(result.tags.genre.radiohead.evidenceCount).toBe(1);
  });

  it('build_skipEvidence_infersGenreTagFromArtist', () => {
    const builder = new TagWeightBuilder();
    const evidence = [
      { type: 'listen', artist: 'Daft Punk', playedAt: '2026-01-01T00:00:00Z' },
      { type: 'skip', artist: 'Daft Punk', playedAt: '2026-01-02T00:00:00Z' },
    ];

    const result = builder.build(evidence);

    expect(result.tags.genre['daft punk']).toBeDefined();
    expect(result.tags.genre['daft punk'].evidenceCount).toBe(2);
  });

  it('build_searchEvidence_infersBehaviorTagsFromKeywords', () => {
    const builder = new TagWeightBuilder();
    const evidence = [
      { type: 'search', extractedKeywords: ['jazz', 'blues'], timestamp: '2026-01-01T00:00:00Z' },
    ];

    const result = builder.build(evidence);

    expect(result.tags.behavior.jazz).toBeDefined();
    expect(result.tags.behavior.blues).toBeDefined();
  });

  it('build_timePatternEvidence_infersBehaviorTagFromPeriod', () => {
    const builder = new TagWeightBuilder();
    const evidence = [{ type: 'time_pattern', period: 'morning', timestamp: '2026-01-01T08:00:00Z' }];

    const result = builder.build(evidence);

    expect(result.tags.behavior.morning).toBeDefined();
    expect(result.tags.behavior.morning.evidenceCount).toBe(1);
  });

  it('build_chatEvidence_infersChatTag', () => {
    const builder = new TagWeightBuilder();
    const evidence = [{ type: 'chat', timestamp: '2026-01-01T00:00:00Z' }];

    const result = builder.build(evidence);

    expect(result.tags.chat.casual).toBeDefined();
  });

  it('build_withWeightStrategy_usesStrategyCalculation', () => {
    const mockStrategy = { calculate: vi.fn(() => 0.42) };
    const builder = new TagWeightBuilder({ weightStrategy: mockStrategy });
    const evidence = [
      { tags: [{ dimension: 'genre', name: 'rock' }], playedAt: '2026-01-01T00:00:00Z' },
    ];

    const result = builder.build(evidence);

    expect(mockStrategy.calculate).toHaveBeenCalledTimes(1);
    expect(result.tags.genre.rock.weight).toBe(0.42);
  });

  it('build_withoutStrategies_usesDefaultWeight', () => {
    const builder = new TagWeightBuilder();
    const evidence = [
      { tags: [{ dimension: 'genre', name: 'rock' }], playedAt: '2026-01-01T00:00:00Z' },
    ];

    const result = builder.build(evidence);

    // _defaultWeight = min(1/10, 1.0) * 0.7 = 0.07
    expect(result.tags.genre.rock.weight).toBeCloseTo(0.07, 5);
  });

  it('build_withDecayStrategy_appliesDecayToWeights', () => {
    const mockWeight = { calculate: vi.fn(() => 0.8) };
    const mockDecay = { decay: vi.fn((w) => w * 0.5) };
    const builder = new TagWeightBuilder({ weightStrategy: mockWeight, decayStrategy: mockDecay });
    const evidence = [
      { tags: [{ dimension: 'genre', name: 'rock' }], playedAt: '2026-01-01T00:00:00Z' },
    ];

    const result = builder.build(evidence, { daysSinceLastSeen: 30 });

    expect(mockWeight.calculate).toHaveBeenCalledTimes(1);
    expect(mockDecay.decay).toHaveBeenCalledWith(0.8, { daysSinceLastSeen: 30 });
    expect(result.tags.genre.rock.weight).toBe(0.4); // 0.8 * 0.5
  });

  it('build_withEventBus_emitsBuildingEvent', () => {
    const eventBus = { emit: vi.fn() };
    const builder = new TagWeightBuilder({ eventBus });
    const evidence = [
      { tags: [{ dimension: 'genre', name: 'rock' }], playedAt: '2026-01-01T00:00:00Z' },
      { tags: [{ dimension: 'mood', name: 'happy' }], playedAt: '2026-01-02T00:00:00Z' },
    ];

    builder.build(evidence);

    expect(eventBus.emit).toHaveBeenCalledWith('profile:building', { tagCount: 2 });
  });

  it('build_withoutEventBus_doesNotThrow', () => {
    const builder = new TagWeightBuilder();
    const evidence = [
      { tags: [{ dimension: 'genre', name: 'rock' }], playedAt: '2026-01-01T00:00:00Z' },
    ];

    expect(() => builder.build(evidence)).not.toThrow();
  });

  it('build_lastSeen_picksLatestTimestamp', () => {
    const builder = new TagWeightBuilder();
    const evidence = [
      { tags: [{ dimension: 'genre', name: 'rock' }], playedAt: '2026-01-01T00:00:00Z' },
      { tags: [{ dimension: 'genre', name: 'rock' }], playedAt: '2026-03-01T00:00:00Z' },
      { tags: [{ dimension: 'genre', name: 'rock' }], playedAt: '2026-02-01T00:00:00Z' },
    ];

    const result = builder.build(evidence);

    expect(result.tags.genre.rock.lastSeen).toBe('2026-03-01T00:00:00Z');
  });
});

// ─── SchemaMigrator ───

describe('SchemaMigrator', () => {
  it('migrate_currentVersion_returnsProfileUnchanged', () => {
    const migrator = new SchemaMigrator();
    const profile = { schemaVersion: 1, tags: { genre: {} } };

    const result = migrator.migrate(profile);

    expect(result.schemaVersion).toBe(1);
    expect(result.tags).toEqual({ genre: {} });
  });

  it('migrate_v1ToV3_appliesMigrationChain', () => {
    const migrator = new SchemaMigrator();
    migrator.register(1, 2, (p) => ({ ...p, v2Field: 'added' }));
    migrator.register(2, 3, (p) => ({ ...p, v3Field: 'added' }));

    const profile = { schemaVersion: 1, tags: {} };
    const result = migrator.migrate(profile);

    expect(result.schemaVersion).toBe(3);
    expect(result.v2Field).toBe('added');
    expect(result.v3Field).toBe('added');
    expect(result.tags).toEqual({});
  });

  it('migrate_missingMigration_stopsGracefully', () => {
    const migrator = new SchemaMigrator();
    migrator.register(1, 2, (p) => ({ ...p, v2: true }));
    // no 2→3 registered, but targetVersion is now 2

    const profile = { schemaVersion: 1 };
    const result = migrator.migrate(profile);

    expect(result.schemaVersion).toBe(2);
    expect(result.v2).toBe(true);
  });

  it('migrate_missingSchemaVersion_treatsAsV1', () => {
    const migrator = new SchemaMigrator();
    migrator.register(1, 2, (p) => ({ ...p, migrated: true }));

    const profile = { tags: {} };
    const result = migrator.migrate(profile);

    expect(result.schemaVersion).toBe(2);
    expect(result.migrated).toBe(true);
  });

  it('needsMigration_outdatedVersion_returnsTrue', () => {
    const migrator = new SchemaMigrator();
    migrator.register(1, 2, (p) => p);

    expect(migrator.needsMigration({ schemaVersion: 1 })).toBe(true);
  });

  it('needsMigration_currentVersion_returnsFalse', () => {
    const migrator = new SchemaMigrator();
    migrator.register(1, 2, (p) => p);

    expect(migrator.needsMigration({ schemaVersion: 2 })).toBe(false);
  });

  it('migrate_nullProfile_returnsNull', () => {
    const migrator = new SchemaMigrator();
    migrator.register(1, 2, (p) => p);

    expect(migrator.migrate(null)).toBeNull();
  });

  it('needsMigration_nullProfile_returnsFalse', () => {
    const migrator = new SchemaMigrator();
    expect(migrator.needsMigration(null)).toBe(false);
  });

  it('schemaMigrator_singleton_hasDefaultTargetVersion', () => {
    expect(schemaMigrator).toBeInstanceOf(SchemaMigrator);
    expect(schemaMigrator.targetVersion).toBe(1);
    expect(schemaMigrator.needsMigration({ schemaVersion: 1 })).toBe(false);
  });
});
