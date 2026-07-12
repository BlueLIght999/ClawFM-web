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
import { getWeather } from './infrastructure/environment/weatherService.js';

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
import { legacyIntentRouterAdapter } from './infrastructure/agent/LegacyIntentRouterAdapter.js';
import { legacyStreamingChatAdapter } from './infrastructure/llm/LegacyStreamingChatAdapter.js';
import { deepSeekLlmAdapter } from './infrastructure/llm/DeepSeekLlmAdapter.js';

import { createPlaybackService } from './application/services/PlaybackService.js';
import { createConversationService } from './application/services/ConversationService.js';
import { createColdStartService } from './application/services/ColdStartService.js';
import { createStreamingConversationService } from './application/services/StreamingConversationService.js';
import { createAuthenticationService } from './application/services/AuthenticationService.js';
import { createDjSpeechService } from './application/services/DjSpeechService.js';
import { createAgentTurnService } from './application/services/AgentTurnService.js';
import { createPlanBlockService } from './application/services/PlanBlockService.js';
import { createCrabInteractionService } from './application/services/CrabInteractionService.js';
import { createSpeechCompletionService } from './application/services/SpeechCompletionService.js';
import { createClientLifecycleService } from './application/services/ClientLifecycleService.js';

// D9: Port contracts — JSDoc typedefs that document the interface
// for legacy services still in migration.  These are imported for
// contract discovery; the actual objects are the legacy instances below.
import './application/ports/services/PlaybackQueuePort.js';
import './application/ports/services/PlaybackSchedulerPort.js';
import './application/ports/services/RecommendationPort.js';

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

  const services = createApplicationServices({ legacy, adapters, repositories, eventPublisher });

  return {
    ...services,
    ...legacy,
    weatherAdapter: adapters.weather,
    speechSynthAdapter: adapters.speech,
    musicSource: adapters.music,
    listenerProfileRepository: legacyListenerProfileRepository,
    llmAdapter: adapters.llm,
    checkTtsHealth,
    getTtsStatus,
    eventPublisher,
    buildSongChangePayload,
  };
}

function createRepositories() {
  return {
    chatHistory: legacyChatHistoryRepository,
    profile: legacyListenerProfileRepository,
  };
}

function createApplicationServices({ legacy, adapters, repositories, eventPublisher }) {
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

  const agentTurnService = createAgentTurnService({
    intentRouter: legacyIntentRouterAdapter, conversation: conversationService,
    contextBuilder: { assemble: assemblePrompt }, weather,
    queue, scheduler, djStatus: { isConfigured: llm.isConfigured },
    userActivity: { setLastUserChat: legacy.setLastUserChat },
  });

  const planBlockService = createPlanBlockService({ planner: { getPlan }, recommender, queue });
  const crabInteractionService = createCrabInteractionService({ scheduler });
  const speechCompletionService = createSpeechCompletionService({ scheduler, queue });
  const clientLifecycleService = createClientLifecycleService({ scheduler });

  return {
    playbackService, conversationService, coldStartService,
    streamingConversationService, authenticationService, djSpeechService,
    agentTurnService, planBlockService, crabInteractionService, speechCompletionService, clientLifecycleService,
  };
}
