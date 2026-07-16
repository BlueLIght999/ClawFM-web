import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ProfileOrchestrator — domain-layer orchestrator for the profile pipeline.
 *
 * Tests the full lifecycle: constructor injection, runPipeline (collect → build
 * → snapshot → events), query methods (isFirstRun, getCurrentProfile, getTopTags,
 * getTagsByDimension), and the port-compatible interface.
 *
 * Builder modules (TagWeightBuilder, WeightStrategy, DecayStrategy, SchemaMigrator)
 * are mocked via vi.mock because they are not yet implemented in the codebase.
 * Collectors and ProfileEventBus are real domain classes. Mock collectors are
 * passed via the constructor's `collectors` option.
 */

// ─── Hoisted shared mock functions (accessible inside vi.mock factories) ───
const mocks = vi.hoisted(() => ({
  build: vi.fn(),
  migrate: vi.fn(),
}));

// ─── Mock builder modules ───
// NOTE: Regular functions (not arrow functions) are required because the
// orchestrator instantiates these classes with `new`. Arrow functions lack
// [[Construct]] and throw "is not a constructor" when used with `new`.
vi.mock('../domain/profile/builders/TagWeightBuilder.js', () => ({
  TagWeightBuilder: vi.fn().mockImplementation(function () {
    return { build: mocks.build };
  }),
}));

vi.mock('../domain/profile/builders/WeightStrategy.js', () => ({
  DefaultWeightStrategy: vi.fn().mockImplementation(function () {
    return { name: 'default' };
  }),
}));

vi.mock('../domain/profile/builders/DecayStrategy.js', () => ({
  EbbinghausDecayStrategy: vi.fn().mockImplementation(function (opts) {
    return { name: 'ebbinghaus', ...opts };
  }),
}));

vi.mock('../domain/profile/builders/SchemaMigrator.js', () => ({
  SchemaMigrator: vi.fn().mockImplementation(function () {
    return { migrate: mocks.migrate };
  }),
}));

// ─── Imports (resolved after vi.mock declarations) ───
import { ProfileOrchestrator } from '../domain/profile/ProfileOrchestrator.js';
import { ProfileEventBus } from '../domain/profile/events/ProfileEventBus.js';
import { DefaultWeightStrategy } from '../domain/profile/builders/WeightStrategy.js';
import { EbbinghausDecayStrategy } from '../domain/profile/builders/DecayStrategy.js';
import { TagWeightBuilder } from '../domain/profile/builders/TagWeightBuilder.js';
import { SchemaMigrator } from '../domain/profile/builders/SchemaMigrator.js';

// ─── Helper: create a mock collector ───
function makeCollector(name, evidence = []) {
  return {
    name,
    collect: vi.fn().mockResolvedValue({ evidence, count: evidence.length }),
  };
}

// ─── Reset shared mocks before each test ───
beforeEach(() => {
  mocks.build.mockReset();
  mocks.migrate.mockReset();
  // Safe defaults so tests that don't care about builder output still work
  mocks.build.mockReturnValue({ tags: {}, schemaVersion: 1 });
  mocks.migrate.mockImplementation((p) => p);

  // Clear constructor call histories (mockClear preserves implementations)
  DefaultWeightStrategy.mockClear();
  EbbinghausDecayStrategy.mockClear();
  TagWeightBuilder.mockClear();
  SchemaMigrator.mockClear();
});

// ═══════════════════════════════════════════════════════════════════════
// Constructor
// ═══════════════════════════════════════════════════════════════════════

describe('ProfileOrchestrator constructor', () => {
  it('constructor_withDefaults_createsDefaultCollectorsStrategiesAndEventBus', () => {
    const orchestrator = new ProfileOrchestrator();

    // Six default collector instances are created
    expect(orchestrator.collectors).toHaveLength(6);
    expect(orchestrator.collectors.map((c) => c.name)).toEqual([
      'ListenHistoryCollector',
      'ChatHistoryCollector',
      'SkipBehaviorCollector',
      'TimePatternCollector',
      'SearchQueryCollector',
      'PlanSelectionCollector',
    ]);

    // Default weight strategy and decay strategy were constructed
    expect(DefaultWeightStrategy).toHaveBeenCalledTimes(1);
    expect(EbbinghausDecayStrategy).toHaveBeenCalledWith({ halfLifeDays: 30 });

    // Default event bus is a real ProfileEventBus
    expect(orchestrator.eventBus).toBeInstanceOf(ProfileEventBus);

    // Builder and schema migrator were constructed
    expect(TagWeightBuilder).toHaveBeenCalledTimes(1);
    expect(SchemaMigrator).toHaveBeenCalledTimes(1);

    // No cached profile yet
    expect(orchestrator._currentProfile).toBeNull();
  });

  it('constructor_withCustomDependencies_usesInjectedValuesAndSkipsDefaults', () => {
    const customCollectors = [makeCollector('A'), makeCollector('B')];
    const customWeightStrategy = { name: 'custom-weight' };
    const customDecayStrategy = { name: 'custom-decay' };
    const customEventBus = new ProfileEventBus();
    const customLogger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };

    const orchestrator = new ProfileOrchestrator({
      repositories: { snapshot: { save: vi.fn() } },
      collectors: customCollectors,
      weightStrategy: customWeightStrategy,
      decayStrategy: customDecayStrategy,
      eventBus: customEventBus,
      logger: customLogger,
    });

    expect(orchestrator.collectors).toBe(customCollectors);
    expect(orchestrator.weightStrategy).toBe(customWeightStrategy);
    expect(orchestrator.decayStrategy).toBe(customDecayStrategy);
    expect(orchestrator.eventBus).toBe(customEventBus);
    expect(orchestrator.logger).toBe(customLogger);
    expect(orchestrator.repositories.snapshot).toBeDefined();

    // Default strategies should NOT have been constructed
    expect(DefaultWeightStrategy).not.toHaveBeenCalled();
    expect(EbbinghausDecayStrategy).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// runPipeline
// ═══════════════════════════════════════════════════════════════════════

describe('ProfileOrchestrator runPipeline', () => {
  it('runPipeline_allCollectorsSucceed_collectsBuildsSavesSnapshotAndEmitsEvents', async () => {
    const collectorA = makeCollector('CollectorA', [
      { type: 'listen', songId: '1' },
    ]);
    const collectorB = makeCollector('CollectorB', [
      { type: 'chat', content: 'hi' },
    ]);

    const builtProfile = {
      tags: { genre: { rock: { weight: 0.9, evidenceCount: 2 } } },
      schemaVersion: 2,
    };
    mocks.build.mockReturnValue(builtProfile);
    mocks.migrate.mockImplementation((p) => ({ ...p, migrated: true }));

    const snapshotRepo = { save: vi.fn() };
    const eventBus = new ProfileEventBus();
    const startedHandler = vi.fn();
    const completedHandler = vi.fn();
    const snapshotHandler = vi.fn();
    const updatedHandler = vi.fn();
    eventBus.on('collection:started', startedHandler);
    eventBus.on('collection:completed', completedHandler);
    eventBus.on('profile:snapshot', snapshotHandler);
    eventBus.on('profile:updated', updatedHandler);

    const orchestrator = new ProfileOrchestrator({
      repositories: { snapshot: snapshotRepo },
      collectors: [collectorA, collectorB],
      eventBus,
    });

    const result = await orchestrator.runPipeline({ someSource: 'data' });

    // Both collectors received the sources object
    expect(collectorA.collect).toHaveBeenCalledWith({ someSource: 'data' });
    expect(collectorB.collect).toHaveBeenCalledWith({ someSource: 'data' });

    // Builder received all collected evidence
    expect(mocks.build).toHaveBeenCalledWith([
      { type: 'listen', songId: '1' },
      { type: 'chat', content: 'hi' },
    ]);

    // Migrator received the built profile
    expect(mocks.migrate).toHaveBeenCalledWith(builtProfile);

    // Snapshot saved with migrated profile and its schema version
    expect(snapshotRepo.save).toHaveBeenCalledWith(result, 2);

    // Events emitted
    expect(startedHandler).toHaveBeenCalledTimes(1);
    expect(startedHandler.mock.calls[0][0].collectorName).toBe('pipeline');
    expect(completedHandler).toHaveBeenCalledTimes(2);
    expect(snapshotHandler).toHaveBeenCalledTimes(1);
    expect(updatedHandler).toHaveBeenCalledTimes(1);

    // Profile was cached
    expect(orchestrator._currentProfile).toBe(result);

    // Result carries the migrated flag
    expect(result.migrated).toBe(true);
  });

  it('runPipeline_collectorFails_continuesWithRemainingCollectorsAndLogsWarning', async () => {
    const logger = { warn: vi.fn() };
    const failingCollector = {
      name: 'FailingCollector',
      collect: vi.fn().mockRejectedValue(new Error('boom')),
    };
    const goodCollector = makeCollector('GoodCollector', [
      { type: 'listen', songId: '1' },
    ]);

    const orchestrator = new ProfileOrchestrator({
      collectors: [failingCollector, goodCollector],
      logger,
    });

    const result = await orchestrator.runPipeline({});

    // Pipeline still returns a profile
    expect(result).toBeDefined();

    // Logger received a warning about the failed collector
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const warnArgs = logger.warn.mock.calls[0];
    expect(warnArgs[0]).toBe('[ProfileOrchestrator]');
    expect(warnArgs[1]).toContain('FailingCollector');

    // Builder only received evidence from the successful collector
    expect(mocks.build).toHaveBeenCalledWith([{ type: 'listen', songId: '1' }]);
  });

  it('runPipeline_noRepositories_doesNotCrashAndReturnsProfile', async () => {
    const collector = makeCollector('Solo', [{ type: 'listen' }]);

    const orchestrator = new ProfileOrchestrator({
      collectors: [collector],
    });

    const result = await orchestrator.runPipeline({});

    expect(result).toBeDefined();
    expect(result.tags).toEqual({});
  });
});

// ═══════════════════════════════════════════════════════════════════════
// isFirstRun
// ═══════════════════════════════════════════════════════════════════════

describe('ProfileOrchestrator isFirstRun', () => {
  it('isFirstRun_noCollectionStateRepository_returnsTrue', async () => {
    const orchestrator = new ProfileOrchestrator({});
    expect(await orchestrator.isFirstRun()).toBe(true);
  });

  it('isFirstRun_collectionStateHasRecords_returnsFalse', async () => {
    const orchestrator = new ProfileOrchestrator({
      repositories: {
        collectionState: { getAll: vi.fn(() => [{ id: 'state-1' }]) },
      },
    });
    expect(await orchestrator.isFirstRun()).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// getCurrentProfile
// ═══════════════════════════════════════════════════════════════════════

describe('ProfileOrchestrator getCurrentProfile', () => {
  it('getCurrentProfile_cachedProfile_returnsCacheWithoutLoading', async () => {
    const orchestrator = new ProfileOrchestrator({});
    const cached = { tags: {}, schemaVersion: 1 };
    orchestrator._currentProfile = cached;

    const result = await orchestrator.getCurrentProfile();

    expect(result).toBe(cached);
    // Migrate should not have been called (cache hit)
    expect(mocks.migrate).not.toHaveBeenCalled();
  });

  it('getCurrentProfile_notCached_loadsFromSnapshotAndMigrates', async () => {
    const snapshotProfile = {
      tags: { genre: { rock: { weight: 0.5 } } },
      schemaVersion: 1,
    };
    mocks.migrate.mockImplementation((p) => ({ ...p, loadedFromSnapshot: true }));

    const orchestrator = new ProfileOrchestrator({
      repositories: {
        snapshot: { latest: vi.fn(() => ({ profile: snapshotProfile })) },
      },
    });

    const result = await orchestrator.getCurrentProfile();

    expect(mocks.migrate).toHaveBeenCalledWith(snapshotProfile);
    expect(result.loadedFromSnapshot).toBe(true);
    // Profile was cached for subsequent calls
    expect(orchestrator._currentProfile).toBe(result);
  });

  it('getCurrentProfile_noSnapshotRepository_returnsNull', async () => {
    const orchestrator = new ProfileOrchestrator({});
    const result = await orchestrator.getCurrentProfile();
    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// getTopTags
// ═══════════════════════════════════════════════════════════════════════

describe('ProfileOrchestrator getTopTags', () => {
  it('getTopTags_multipleDimensions_returnsTagsSortedByWeightDescending', async () => {
    const profile = {
      tags: {
        genre: {
          rock: { weight: 0.8, evidenceCount: 5 },
          pop: { weight: 0.5, evidenceCount: 3 },
          jazz: { weight: 0.9, evidenceCount: 7 },
        },
        mood: {
          happy: { weight: 0.3, evidenceCount: 2 },
        },
      },
    };

    const orchestrator = new ProfileOrchestrator({});
    orchestrator._currentProfile = profile;

    const topTags = await orchestrator.getTopTags(2);

    expect(topTags).toHaveLength(2);
    expect(topTags[0].name).toBe('jazz');
    expect(topTags[0].weight).toBe(0.9);
    expect(topTags[0].dimension).toBe('genre');
    expect(topTags[1].name).toBe('rock');
    expect(topTags[1].weight).toBe(0.8);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// getTagsByDimension
// ═══════════════════════════════════════════════════════════════════════

describe('ProfileOrchestrator getTagsByDimension', () => {
  it('getTagsByDimension_validDimension_returnsTagsForThatDimension', async () => {
    const profile = {
      tags: {
        genre: {
          rock: { weight: 0.8, evidenceCount: 5 },
          pop: { weight: 0.5, evidenceCount: 3 },
        },
        mood: {
          happy: { weight: 0.3, evidenceCount: 2 },
        },
      },
    };

    const orchestrator = new ProfileOrchestrator({});
    orchestrator._currentProfile = profile;

    const tags = await orchestrator.getTagsByDimension('genre');

    expect(tags).toHaveLength(2);
    const names = tags.map((t) => t.name);
    expect(names).toContain('rock');
    expect(names).toContain('pop');
    // All returned tags belong to the requested dimension
    expect(tags.every((t) => t.dimension === 'genre')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// getPortImplementation
// ═══════════════════════════════════════════════════════════════════════

describe('ProfileOrchestrator getPortImplementation', () => {
  it('getPortImplementation_always_returnsObjectWithAllPortMethods', () => {
    const orchestrator = new ProfileOrchestrator({});
    const port = orchestrator.getPortImplementation();

    expect(typeof port.getCurrentProfile).toBe('function');
    expect(typeof port.getTopTags).toBe('function');
    expect(typeof port.getTagsByDimension).toBe('function');
    expect(typeof port.isFirstRun).toBe('function');
    expect(typeof port.getSnapshots).toBe('function');
    expect(typeof port.getCurrentCluster).toBe('function');
    expect(typeof port.triggerCollection).toBe('function');
    expect(typeof port.triggerFullBuild).toBe('function');
    expect(typeof port.triggerAnalysis).toBe('function');
    expect(typeof port.enrichSong).toBe('function');
  });

  it('getPortImplementation_triggerCollection_invokesRunPipeline', async () => {
    const collector = makeCollector('C1', []);
    const orchestrator = new ProfileOrchestrator({ collectors: [collector] });
    const port = orchestrator.getPortImplementation();

    await port.triggerCollection({ src: 'data' });

    expect(collector.collect).toHaveBeenCalledWith({ src: 'data' });
  });

  it('getPortImplementation_getSnapshots_delegatesToSnapshotRepository', () => {
    const recentFn = vi.fn(() => ['snap1', 'snap2']);
    const orchestrator = new ProfileOrchestrator({
      repositories: { snapshot: { recent: recentFn } },
    });
    const port = orchestrator.getPortImplementation();

    const snapshots = port.getSnapshots(5);

    expect(snapshots).toEqual(['snap1', 'snap2']);
    expect(recentFn).toHaveBeenCalledWith(5);
  });

  it('getPortImplementation_getCurrentCluster_delegatesToClusterRepository', () => {
    const cluster = { id: 'c1', size: 10 };
    const orchestrator = new ProfileOrchestrator({
      repositories: { cluster: { latest: vi.fn(() => cluster) } },
    });
    const port = orchestrator.getPortImplementation();

    expect(port.getCurrentCluster()).toBe(cluster);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// getEventBus
// ═══════════════════════════════════════════════════════════════════════

describe('ProfileOrchestrator getEventBus', () => {
  it('getEventBus_always_returnsTheEventBusInstance', () => {
    const eventBus = new ProfileEventBus();
    const orchestrator = new ProfileOrchestrator({ eventBus });

    expect(orchestrator.getEventBus()).toBe(eventBus);
  });
});
