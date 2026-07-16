import { describe, expect, it, vi } from 'vitest';
import { createAgentTurnService } from '../agent/application/services/AgentTurnService.js';

function createDeps(overrides = {}) {
  const queue = {
    length: 3,
    mode: 'sequential',
    upcomingSongs: [{ id: 'queued' }],
    insertNext: vi.fn(),
    ...overrides.queue,
  };
  const scheduler = {
    ...overrides.scheduler,
  };
  const conversation = {
    handleFastAction: vi.fn(async () => ({ handled: false, toolResults: '' })),
    handlePlanAction: vi.fn(async () => ({ handled: false, toolResults: '' })),
    handlePersonalizedRecommendation: vi.fn(async () => ({ snapshot: null, toolResults: '' })),
    handleRecommendationAction: vi.fn(async ({ snapshot }) => ({ snapshot, toolResults: '' })),
    ...overrides.conversation,
  };
  const deps = {
    queue,
    scheduler,
    intentRouter: {
      route: vi.fn(async () => ({ route: 'claude', action: 'chat', params: {} })),
      ...overrides.intentRouter,
    },
    conversation,
    contextBuilder: {
      assemble: vi.fn(() => 'assembled-context'),
      ...overrides.contextBuilder,
    },
    weather: {
      current: vi.fn(async () => 'sunny'),
      ...overrides.weather,
    },
    djStatus: {
      isConfigured: vi.fn(() => true),
      ...overrides.djStatus,
    },
    userActivity: {
      setLastUserChat: vi.fn(),
      ...overrides.userActivity,
    },
    now: vi.fn(() => 12345),
    persona: 'test-persona',
    music: { search: vi.fn(async () => []), ...overrides.music },
  };
  return deps;
}

describe('AgentTurnService', () => {
  it('handleMessage_djUnavailable_returnsOfflineMessageWithoutRouting', async () => {
    const deps = createDeps({
      djStatus: { isConfigured: vi.fn(() => false) },
    });
    const service = createAgentTurnService(deps);

    const result = await service.handleMessage({ text: 'hello', snapshot: { future: [] } });

    expect(deps.userActivity.setLastUserChat).toHaveBeenCalledWith('hello');
    expect(deps.intentRouter.route).not.toHaveBeenCalled();
    expect(result).toEqual({
      handled: true,
      snapshot: { future: [] },
      unavailableMessage: {
        text: 'DJ 暂时离线，请稍后再试。',
      },
    });
  });

  it('handleMessage_fastActionHandled_returnsConversationEventsWithoutStreaming', async () => {
    const deps = createDeps({
      intentRouter: {
        route: vi.fn(async () => ({ route: 'ncm', action: 'skip', params: {} })),
      },
      conversation: {
        handleFastAction: vi.fn(async () => ({ handled: true, state: { isPlaying: true } })),
      },
    });
    const service = createAgentTurnService(deps);

    const result = await service.handleMessage({ text: 'skip', snapshot: null });

    expect(deps.intentRouter.route).toHaveBeenCalledWith('skip');
    expect(deps.conversation.handleFastAction).toHaveBeenCalledWith({ route: 'ncm', action: 'skip', params: {} });
    expect(deps.contextBuilder.assemble).not.toHaveBeenCalled();
    expect(result).toEqual({
      handled: true,
      routing: { route: 'ncm', action: 'skip', params: {} },
      snapshot: null,
      conversationResults: [{ handled: true, state: { isPlaying: true } }],
    });
  });

  it('handleMessage_searchResults_areQueuedInDisplayOrderAndIncludedInContext', async () => {
    const songs = [
      { id: 'a', title: 'First', artist: 'Artist A' },
      { id: 'b', title: 'Second', artist: 'Artist B' },
    ];
    const deps = createDeps({
      intentRouter: {
        route: vi.fn(async () => ({ route: 'hybrid', action: 'play_song', params: {}, results: songs })),
      },
    });
    const service = createAgentTurnService(deps);

    const result = await service.handleMessage({ text: 'play first', snapshot: null });

    expect(deps.queue.insertNext).toHaveBeenNthCalledWith(1, songs[1]);
    expect(deps.queue.insertNext).toHaveBeenNthCalledWith(2, songs[0]);
    expect(deps.contextBuilder.assemble).toHaveBeenCalledWith({
      userInput: 'play first',
      toolResults: expect.stringContaining('Search matched 2 song(s): First by Artist A; Second by Artist B'),
      environment: { weather: 'sunny' },
      execTrace: { lastAction: 'play_song', queueLength: 3, mode: 'sequential' },
    });
    expect(result.queueUpdate).toEqual({ upcomingSongs: [{ id: 'queued' }], mode: 'sequential' });
    expect(result.streamRequest).toEqual({
      text: 'play first',
      contextPrompt: 'assembled-context',
      routing: { route: 'hybrid', action: 'play_song', params: {}, results: songs },
      messageId: '12345',
    });
  });

  it('handleMessage_recommendationActions_updateSnapshotBeforeStreaming', async () => {
    const nextSnapshot = { future: [{ id: 'new' }], current: { id: 'now' } };
    const deps = createDeps({
      intentRouter: {
        route: vi.fn(async () => ({ route: 'ncm', action: 'recommend_retry', params: {} })),
      },
      conversation: {
        handleRecommendationAction: vi.fn(async () => ({
          snapshot: nextSnapshot,
          queueUpdate: { upcomingSongs: [{ id: 'fresh' }] },
          toolResults: 'retry result',
        })),
      },
    });
    const service = createAgentTurnService(deps);

    const result = await service.handleMessage({ text: 'try again', snapshot: { future: [{ id: 'old' }] } });

    expect(deps.conversation.handleRecommendationAction).toHaveBeenCalledWith({
      routing: { route: 'ncm', action: 'recommend_retry', params: {} },
      snapshot: { future: [{ id: 'old' }] },
    });
    expect(result.snapshot).toBe(nextSnapshot);
    expect(result.toolResults).toBe('retry result');
    expect(result.queueUpdate).toEqual({ upcomingSongs: [{ id: 'fresh' }] });
    expect(result.streamRequest.contextPrompt).toBe('assembled-context');
  });

  it('handleMessage_mergedRoute_searchesMusicAndReturnsMergedStream', async () => {
    const songs = [
      { id: 's1', name: 'Happy Song', ar: [{ name: 'Artist' }] },
    ];
    const mergedStream = (async function* () { yield '好的！'; })();
    const deps = createDeps({
      intentRouter: {
        route: vi.fn(async () => ({
          route: 'merged',
          action: 'pending',
          params: {},
          mergedChat: {
            streamWithIntent: vi.fn(async () => ({
              intent: Promise.resolve({ action: 'play_mood', params: { mood: 'happy' } }),
              stream: mergedStream,
            })),
          },
        })),
      },
      music: { search: vi.fn(async () => songs) },
    });
    const service = createAgentTurnService(deps);

    const result = await service.handleMessage({ text: '来点开心的', snapshot: null });

    expect(deps.music.search).toHaveBeenCalledWith('欢快 流行', 5);
    expect(result.mergedStream).toBe(mergedStream);
    expect(result.routing.route).toBe('hybrid');
    expect(result.routing.results).toHaveLength(1);
    expect(result.queueUpdate).toBeTruthy();
  });
});
