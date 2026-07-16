/**
 * bootstrap.js — Composition Root (D8)
 *
 * This is the ONLY file that may import from both infrastructure/ and
 * application/services/.  handler.js and server.js receive the wired
 * services object from here and must not import adapters or service
 * factories directly.
 */
import { queue } from './services/queue.js';
import { scheduler } from './services/scheduler.js';
import { recommender } from './services/recommender.js';
import { assemblePrompt } from './services/context.js';
import { getTimeOfDayMood } from './domain/hosting/getTimeOfDayMood.js';
import { isTtsAvailable, checkTtsHealth, getTtsStatus } from './infrastructure/speech/ttsService.js';
import { generatePlan, getPlan, isPlanStale } from './services/planner.js';
import { maybeProactiveSpeech, resetLastSpeechTime, setLastUserChat, setProactiveEnabled } from './services/proactive.js';
import { configureClaude } from './services/claude.js';
import { configurePlanner } from './services/planner.js';
import { getWeather, getWeatherRaw } from './infrastructure/environment/weatherService.js';

import { SocketEventPublisher } from './socket/SocketEventPublisher.js';
import { buildSongChangePayload } from './domain/curation/buildSongChangePayload.js';

import { legacyWeatherAdapter } from './infrastructure/environment/LegacyWeatherAdapter.js';
import { legacySpeechSynthAdapter } from './infrastructure/speech/LegacySpeechSynthAdapter.js';
import { legacyNeteaseMusicSourceAdapter } from './infrastructure/music/LegacyNeteaseMusicSourceAdapter.js';
import { legacyColdOpenWriter } from './infrastructure/llm/LegacyColdOpenWriter.js';
import { legacyDjSpeechWriter } from './infrastructure/llm/LegacyDjSpeechWriter.js';
import { legacyNeteaseAuthClient } from './infrastructure/auth/LegacyNeteaseAuthClient.js';
import { legacyChatHistoryRepository } from './infrastructure/persistence/repositories/LegacyChatHistoryRepository.js';
import { legacyListenerProfileRepository } from './infrastructure/persistence/repositories/LegacyListenerProfileRepository.js';
import { legacyAuthRepository } from './infrastructure/persistence/repositories/LegacyAuthRepository.js';
import { createLegacyIntentRouterAdapter } from './agent/infrastructure/LegacyIntentRouterAdapter.js';
import { routeIntent } from './services/router.js';
import { legacyStreamingChatAdapter } from './agent/infrastructure/LegacyStreamingChatAdapter.js';
import { mergedIntentChatAdapter } from './agent/infrastructure/MergedIntentChatAdapter.js';
import { deepSeekLlmAdapter } from './infrastructure/llm/DeepSeekLlmAdapter.js';
import { loadDjPersona } from './infrastructure/llm/djPersonaLoader.js';
import { llmClient } from './infrastructure/llm/llmClient.js';
import { defaultCorpus } from './infrastructure/storage/defaultCorpus.js';
import { legacyPlanRepository } from './infrastructure/persistence/repositories/LegacyPlanRepository.js';
import { legacyQueueSnapshotRepository } from './infrastructure/persistence/repositories/LegacyQueueSnapshotRepository.js';

import { createPlaybackService } from './application/services/PlaybackService.js';
import { createConversationService } from './agent/application/services/ConversationService.js';
import { createColdStartService } from './application/services/ColdStartService.js';
import { createStreamingConversationService } from './agent/application/services/StreamingConversationService.js';
import { createAuthenticationService } from './application/services/AuthenticationService.js';
import { createDjSpeechService } from './application/services/DjSpeechService.js';
import { createAgentTurnService } from './agent/application/services/AgentTurnService.js';
import { createAgentLoopService } from './agent/application/services/AgentLoopService.js';
import { createToolFactory } from './agent/application/services/ToolFactory.js';
import { createInMemoryToolRegistry } from './agent/infrastructure/InMemoryToolRegistry.js';
import { createDeepSeekFunctionCallingAdapter } from './agent/infrastructure/DeepSeekFunctionCallingAdapter.js';
import { createPlanBlockService } from './application/services/PlanBlockService.js';
import { createCrabInteractionService } from './application/services/CrabInteractionService.js';
import { createSpeechCompletionService } from './application/services/SpeechCompletionService.js';
import { createClientLifecycleService } from './application/services/ClientLifecycleService.js';

// Observability infrastructure
import { logger } from './infrastructure/logging/logger.js';
import { getLogStream } from './infrastructure/logging/logStream.js';
import { MetricsCollector } from './infrastructure/metrics/metrics.js';
import { MetricsPusher } from './infrastructure/metrics/metricsPusher.js';
import { createHealthChecker } from './infrastructure/health/healthCheck.js';
import config from './config.js';

// Profile system (Phase 2 integration)
import { ProfileOrchestrator } from './domain/profile/ProfileOrchestrator.js';
import { ProfileEventBus } from './domain/profile/events/ProfileEventBus.js';
import { legacyProfileSnapshotRepository } from './infrastructure/persistence/repositories/LegacyProfileSnapshotRepository.js';
import { legacyProfileCollectionStateRepository } from './infrastructure/persistence/repositories/LegacyProfileCollectionStateRepository.js';
import { legacyStyleTagCacheRepository } from './infrastructure/persistence/repositories/LegacyStyleTagCacheRepository.js';
import { legacyClusterResultRepository } from './infrastructure/persistence/repositories/LegacyClusterResultRepository.js';
import { legacyListenHistoryRepository } from './infrastructure/persistence/repositories/LegacyListenHistoryRepository.js';
import { legacySeedPoolRepository } from './infrastructure/persistence/repositories/LegacySeedPoolRepository.js';
import { loadConfig as loadProfileConfig } from './infrastructure/profile/ProfileConfigLoader.js';
import { WebSearchAdapter } from './infrastructure/profile/WebSearchAdapter.js';

// D9: Port contracts — JSDoc typedefs that document the interface
// for legacy services still in migration.  These are imported for
// contract discovery; the actual objects are the legacy instances below.
import './application/ports/services/PlaybackQueuePort.js';
import './application/ports/services/PlaybackSchedulerPort.js';
import './application/ports/services/RecommendationPort.js';
import './application/ports/services/ProfileQueryPort.js';
import './application/ports/services/ProfileCommandPort.js';
import './application/ports/services/ClusterPort.js';

/**
 * Wire all dependencies and return a services object.
 * @param {import('socket.io').Server} io — the Socket.IO server
 */
export function createServices(io) {
  const eventPublisher = new SocketEventPublisher(io);
  const repositories = createRepositories();
  const legacy = { queue, scheduler, recommender, assemblePrompt, getTimeOfDayMood,
    isTtsAvailable, generatePlan, getPlan, isPlanStale, getWeather,
    maybeProactiveSpeech, resetLastSpeechTime, setLastUserChat, setProactiveEnabled };
  const adapters = { weather: legacyWeatherAdapter, speech: legacySpeechSynthAdapter,
    music: legacyNeteaseMusicSourceAdapter, llm: deepSeekLlmAdapter,
    coldOpenWriter: legacyColdOpenWriter, djSpeechWriter: legacyDjSpeechWriter };

  // ─── D8: Inject infrastructure into services (composition root) ──
  queue.snapshotRepository = legacyQueueSnapshotRepository;
  scheduler.configure({
    music: legacyNeteaseMusicSourceAdapter,
    listenHistory: legacyListenHistoryRepository,
  });
  recommender.configure({
    music: legacyNeteaseMusicSourceAdapter,
    listenHistory: legacyListenHistoryRepository,
    seedPool: legacySeedPoolRepository,
    profile: legacyListenerProfileRepository,
    corpus: defaultCorpus,
  });
  configureClaude({
    persona: loadDjPersona(),
    llm: deepSeekLlmAdapter,
    llmClient,
    chatHistory: legacyChatHistoryRepository,
    profile: legacyListenerProfileRepository,
  });
  configurePlanner({
    llm: deepSeekLlmAdapter,
    weather: legacyWeatherAdapter,
    planRepository: legacyPlanRepository,
  });

  // ─── Observability ──────────────────────────────────────
  const logStream = getLogStream();
  const metricsCollector = new MetricsCollector();
  const metricsPusher = new MetricsPusher({ metricsCollector, io, intervalMs: 5000 });
  const healthChecker = createHealthChecker({
    checks: {
      neteaseApi: async () => {
        const start = Date.now();
        try {
          const resp = await fetch(`http://localhost:${config.netease.apiPort}/login/status`);
          const data = await resp.json();
          const latency = Date.now() - start;
          const code = data?.code ?? data?.data?.code;
          return { status: code === 200 ? 'up' : 'degraded', latencyMs: latency };
        } catch {
          return { status: 'down', latencyMs: Date.now() - start };
        }
      },
      tts: async () => {
        const status = getTtsStatus();
        return { status: status.available ? 'up' : 'degraded', provider: status.provider || null };
      },
      database: async () => ({ status: 'up' }),
      deepseek: async () => ({ status: config.deepseekApiKey ? 'up' : 'degraded', configured: !!config.deepseekApiKey }),
      queue: async () => ({ status: 'up', size: queue.length }),
    },
  });

  // Note: Metrics for scheduler callbacks (onSongChange, onDjSpeechNeeded)
  // are collected in handler.js's wireSchedulerCallbacks to avoid being
  // overwritten when that function reassigns the callback properties.

  const services = createApplicationServices({ legacy, adapters, repositories, eventPublisher, logger, metricsCollector });

  // ─── Profile System ────────────────────────────────────
  const profileSystem = createProfileSystem({
    music: adapters.music,
    logger,
    repositories,
  });

  return {
    ...services,
    ...legacy,
    weatherAdapter: adapters.weather,
    speechSynthAdapter: adapters.speech,
    musicSource: adapters.music,
    music: adapters.music,
    listenerProfileRepository: legacyListenerProfileRepository,
    llmAdapter: adapters.llm,
    checkTtsHealth,
    getTtsStatus,
    eventPublisher,
    buildSongChangePayload,
    // Observability
    logger,
    logStream,
    metricsCollector,
    metricsPusher,
    healthChecker,
    // Profile system
    profileSystem,
    profileOrchestrator: profileSystem.orchestrator,
    // Weather (raw data for bubble generation)
    getWeatherRaw,
    // Chat history (for session persistence)
    chatHistory: legacyChatHistoryRepository,
  };
}

function createRepositories() {
  return {
    chatHistory: legacyChatHistoryRepository,
    profile: legacyListenerProfileRepository,
  };
}

function createApplicationServices({ legacy, adapters, repositories, eventPublisher, _logger, _metricsCollector }) {
  const { queue, scheduler, recommender, assemblePrompt, getTimeOfDayMood,
    isTtsAvailable, generatePlan, getPlan } = legacy;
  const { weather, speech, music, llm, coldOpenWriter, djSpeechWriter } = adapters;

  const playbackService = createPlaybackService({ queue, scheduler, recommender, music, getPlan });

  const conversationService = createConversationService({
    queue, scheduler, recommender, repositories, music, planner: { generatePlan, getPlan },
  });

  const coldStartService = createColdStartService({
    queue, scheduler, speech, ttsAvailability: isTtsAvailable,
    weather, timeOfDay: getTimeOfDayMood, introWriter: coldOpenWriter,
  });

  const streamingConversationService = createStreamingConversationService({
    chat: legacyStreamingChatAdapter, chatHistory: repositories.chatHistory,
    speech, ttsAvailability: isTtsAvailable,
  });

  const authenticationService = createAuthenticationService({
    authClient: legacyNeteaseAuthClient, authRepository: legacyAuthRepository,
    recommender, queue, scheduler, planner: { generatePlan, getPlan }, eventPublisher,
  });

  const djSpeechService = createDjSpeechService({
    scheduler, recommender, queueStore: queue,
    transitionWriter: djSpeechWriter, refillWriter: djSpeechWriter,
    weather, timeOfDay: getTimeOfDayMood, promptBuilder: assemblePrompt,
    speech, ttsAvailability: isTtsAvailable,
  });

  const intentRouter = createLegacyIntentRouterAdapter(routeIntent, { mergedChat: mergedIntentChatAdapter });

  const agentTurnService = createAgentTurnService({
    intentRouter, conversation: conversationService,
    contextBuilder: { assemble: assemblePrompt }, weather,
    queue, scheduler, djStatus: { isConfigured: llm.isConfigured },
    userActivity: { setLastUserChat: legacy.setLastUserChat },
    persona: loadDjPersona(),
    music,
  });

  // ReAct agent loop: function calling + tool registry
  const functionCallingAdapter = createDeepSeekFunctionCallingAdapter();
  const toolRegistry = createInMemoryToolRegistry();
  createToolFactory({
    registry: toolRegistry, scheduler, queue, recommender, music,
    planner: { generatePlan, getPlan },
  });
  const agentLoopService = createAgentLoopService({
    agentTurnService,
    functionCalling: functionCallingAdapter,
    toolRegistry,
    persona: loadDjPersona(),
    contextBuilder: { assemble: assemblePrompt },
    weather, queue,
    userActivity: { setLastUserChat: legacy.setLastUserChat },
    djStatus: { isConfigured: llm.isConfigured },
  });

  const planBlockService = createPlanBlockService({ planner: { getPlan }, recommender, queue });
  const crabInteractionService = createCrabInteractionService({ scheduler });
  const speechCompletionService = createSpeechCompletionService({ scheduler, queue });
  const clientLifecycleService = createClientLifecycleService({ scheduler });

  return {
    playbackService, conversationService, coldStartService,
    streamingConversationService, authenticationService, djSpeechService,
    agentTurnService, agentLoopService, toolRegistry,
    planBlockService, crabInteractionService, speechCompletionService, clientLifecycleService,
  };
}

/**
 * Create the profile system orchestrator with all dependencies wired.
 * This function is the D8-compliant composition point for the profile subsystem.
 */
function createProfileSystem({ music, logger, repositories }) {
  // NOTE: initProfileDb() is called from server.js AFTER initDb() completes,
  // because createServices() runs synchronously before the DB is ready.
  // Do NOT call initProfileDb() here.

  // Load all JSON configs from domain/profile/config/
  const profileConfig = loadProfileConfig();

  // Create profile-specific repositories
  const profileRepositories = {
    snapshot: legacyProfileSnapshotRepository,
    collectionState: legacyProfileCollectionStateRepository,
    styleTagCache: legacyStyleTagCacheRepository,
    cluster: legacyClusterResultRepository,
  };

  // Create the event bus for profile system events
  const eventBus = new ProfileEventBus();

  // Build the orchestrator with all injected dependencies
  const orchestrator = new ProfileOrchestrator({
    repositories: profileRepositories,
    eventBus,
    logger,
  });

  // Sources available to collectors during pipeline runs
  const pipelineSources = {
    listenHistoryRepository: legacyListenHistoryRepository,
    chatHistoryRepository: repositories.chatHistory,
    seedPoolRepository: legacySeedPoolRepository,
    planRepository: { get: () => null },
  };

  // Return a facade that handler.js and server.js can consume
  return {
    orchestrator,
    eventBus,
    config: profileConfig,
    pipelineSources,
    // Port-compatible interface
    ...orchestrator.getPortImplementation(),
    // Expose web search adapter for enrichment chain
    webSearchAdapter: new WebSearchAdapter({ timeout: 5000 }),
    // Music adapter with extended methods for enrichment
    musicAdapter: music,
  };
}
