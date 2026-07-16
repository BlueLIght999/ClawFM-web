import { ListenHistoryCollector } from './collectors/ListenHistoryCollector.js';
import { ChatHistoryCollector } from './collectors/ChatHistoryCollector.js';
import { SkipBehaviorCollector } from './collectors/SkipBehaviorCollector.js';
import { TimePatternCollector } from './collectors/TimePatternCollector.js';
import { SearchQueryCollector } from './collectors/SearchQueryCollector.js';
import { PlanSelectionCollector } from './collectors/PlanSelectionCollector.js';
import { TagWeightBuilder } from './builders/TagWeightBuilder.js';
import { DefaultWeightStrategy } from './builders/WeightStrategy.js';
import { EbbinghausDecayStrategy } from './builders/DecayStrategy.js';
import { SchemaMigrator } from './builders/SchemaMigrator.js';
import { ProfileEventBus } from './events/ProfileEventBus.js';
import { ChatStyleAnalyzer } from './analyzers/ChatStyleAnalyzer.js';
import { EmotionAnalyzer } from './analyzers/EmotionAnalyzer.js';
import { DailyHabitAnalyzer } from './analyzers/DailyHabitAnalyzer.js';
import { UserClusterAnalyzer } from './analyzers/UserClusterAnalyzer.js';
import { RecommendationEnhancer } from './analyzers/RecommendationEnhancer.js';
import { AgentContextAnalyzer } from './analyzers/AgentContextAnalyzer.js';

export class ProfileOrchestrator {
  constructor({
    repositories = {},
    collectors: customCollectors = null,
    weightStrategy = null,
    decayStrategy = null,
    eventBus = null,
    logger = null,
  } = {}) {
    this.repositories = repositories;
    this.logger = logger;
    this._initStrategies({ weightStrategy, decayStrategy, eventBus });
    this.schemaMigrator = new SchemaMigrator();
    this.collectors = customCollectors || this._createDefaultCollectors();
    this.builder = this._createBuilder();
    this.analyzers = this._createAnalyzers();
    this._currentProfile = null;
  }

  _initStrategies({ weightStrategy, decayStrategy, eventBus }) {
    this.eventBus = eventBus || new ProfileEventBus();
    this.weightStrategy = weightStrategy || new DefaultWeightStrategy();
    this.decayStrategy = decayStrategy || new EbbinghausDecayStrategy({ halfLifeDays: 30 });
  }

  _createBuilder() {
    return new TagWeightBuilder({
      weightStrategy: this.weightStrategy,
      decayStrategy: this.decayStrategy,
      eventBus: this.eventBus,
    });
  }

  _createAnalyzers() {
    return {
      chatStyle: new ChatStyleAnalyzer({ eventBus: this.eventBus }),
      emotion: new EmotionAnalyzer({ eventBus: this.eventBus }),
      dailyHabit: new DailyHabitAnalyzer({ eventBus: this.eventBus }),
      userCluster: new UserClusterAnalyzer({ eventBus: this.eventBus }),
      recommendation: new RecommendationEnhancer({ eventBus: this.eventBus }),
      agentContext: new AgentContextAnalyzer({ eventBus: this.eventBus }),
    };
  }

  /**
   * Run the full collection -> build -> snapshot pipeline.
   * @param {object} sources - { listenHistoryRepository, chatHistoryRepository, planRepository }
   * @returns {Promise<object>} the built profile
   */
  async runPipeline(sources = {}) {
    this.eventBus.emitCollectionStarted('pipeline');

    // 1. Collect all evidence
    const allEvidence = [];
    for (const collector of this.collectors) {
      try {
        const result = await collector.collect(sources);
        if (result?.evidence) {
          allEvidence.push(...result.evidence);
          this.eventBus.emitCollectionCompleted(collector.name, result.evidence.length);
        }
      } catch (e) {
        this._log('warn', `Collector ${collector.name} failed:`, e.message);
      }
    }

    // 2. Build weighted tags from evidence
    const profile = this.builder.build(allEvidence);

    // 3. Migrate schema if needed
    const migrated = this.schemaMigrator.migrate(profile);

    // 4. Save snapshot if repository available
    if (this.repositories.snapshot) {
      this.repositories.snapshot.save(migrated, migrated.schemaVersion);
      this.eventBus.emitSnapshotSaved(Date.now());
    }

    // 5. Update current profile
    this._currentProfile = migrated;
    this.eventBus.emitProfileUpdated(migrated);

    return migrated;
  }

  /**
   * Run analysis modules on the current profile.
   * @param {object} evidence — collected evidence grouped by type
   * @returns {Promise<object>} analysis results
   */
  async runAnalysis(evidence = {}) {
    const profile = await this.getCurrentProfile();
    if (!profile) return null;

    const results = {};
    const { chat: chatEvidence = [], listen: listenEvidence = [], time: timeEvidence = [] } = evidence;

    for (const [name, analyzer] of Object.entries(this.analyzers)) {
      try {
        results[name] = await analyzer.analyze(profile, {
          chatEvidence, listenEvidence, timeEvidence,
          snapshots: this.repositories.snapshot?.recent(30) || [],
          songs: [],
        });
      } catch (e) {
        this._log('warn', `Analyzer ${name} failed:`, e.message);
      }
    }

    // Attach analysis to profile
    profile.analysis = results;
    this.eventBus.emitAnalysisCompleted(results);

    return results;
  }

  /**
   * Check if this is the first run (no collection state records).
   */
  async isFirstRun() {
    if (!this.repositories.collectionState) return true;
    const states = this.repositories.collectionState.getAll();
    return !states || states.length === 0;
  }

  /**
   * Get current profile (cached, or load from latest snapshot).
   */
  async getCurrentProfile() {
    if (this._currentProfile) return this._currentProfile;
    if (this.repositories.snapshot) {
      const latest = this.repositories.snapshot.latest();
      if (latest) {
        this._currentProfile = this.schemaMigrator.migrate(latest.profile);
        return this._currentProfile;
      }
    }
    return null;
  }

  /**
   * Get top tags sorted by weight.
   */
  async getTopTags(limit = 10) {
    const profile = await this.getCurrentProfile();
    if (!profile?.tags) return [];
    const all = [];
    for (const [dimension, tags] of Object.entries(profile.tags)) {
      for (const [name, data] of Object.entries(tags)) {
        all.push({ dimension, name, weight: data.weight, evidenceCount: data.evidenceCount });
      }
    }
    return all.sort((a, b) => b.weight - a.weight).slice(0, limit);
  }

  /**
   * Get tags by dimension.
   */
  async getTagsByDimension(dimension) {
    const profile = await this.getCurrentProfile();
    if (!profile?.tags?.[dimension]) return [];
    return Object.entries(profile.tags[dimension]).map(([name, data]) => ({
      dimension, name, weight: data.weight, evidenceCount: data.evidenceCount,
    }));
  }

  /**
   * Get the event bus for external event subscription.
   */
  getEventBus() {
    return this.eventBus;
  }

  /**
   * Get a port-compatible interface for external consumers.
   * Returns an object implementing ProfileQueryPort + ProfileCommandPort.
   */
  getPortImplementation() {
    return {
      getCurrentProfile: () => this.getCurrentProfile(),
      getTopTags: (limit) => this.getTopTags(limit),
      getTagsByDimension: (dim) => this.getTagsByDimension(dim),
      isFirstRun: () => this.isFirstRun(),
      getSnapshots: (limit) => this.repositories.snapshot?.recent(limit) || [],
      getCurrentCluster: () => this.repositories.cluster?.latest() || null,
      triggerCollection: (sources) => this.runPipeline(sources),
      triggerFullBuild: (sources) => this.runPipeline(sources),
      triggerAnalysis: (evidence) => this.runAnalysis(evidence),
      enrichSong: () => Promise.resolve({ source: 'unknown', tags: [], _enriched: false }),
      enhanceSongs: (songs, ctx) => this.analyzers.recommendation?.enhanceSongs(songs, this._currentProfile, ctx) || songs,
      getAgentContext: () => this.analyzers.agentContext?.analyze(this._currentProfile),
    };
  }

  _createDefaultCollectors() {
    return [
      new ListenHistoryCollector({ eventBus: this.eventBus }),
      new ChatHistoryCollector({ eventBus: this.eventBus }),
      new SkipBehaviorCollector({ eventBus: this.eventBus }),
      new TimePatternCollector({ eventBus: this.eventBus }),
      new SearchQueryCollector({ eventBus: this.eventBus }),
      new PlanSelectionCollector({ eventBus: this.eventBus }),
    ];
  }

  _log(level, ...args) {
    if (this.logger?.[level]) this.logger[level]('[ProfileOrchestrator]', ...args);
  }
}
