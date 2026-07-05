import { describe, it, expect, vi } from 'vitest';
import { createDjSpeechService } from '../application/services/DjSpeechService.js';

function createDeps(overrides = {}) {
  const upcomingSongs = [
    { id: 'next-1', title: 'First refill' },
    { id: 'next-2', title: 'Second refill' },
    { id: 'next-3', title: 'Third refill' },
    { id: 'next-4', title: 'Fourth refill' },
  ];
  const scheduler = {
    _transitionId: 'transition-1',
    isPlaying: false,
    speechGenerationDone: vi.fn(),
    speechComplete: vi.fn(),
    ...overrides.scheduler,
  };
  const transitionWriter = {
    writeTransition: vi.fn(async () => ({ say: '<warm>Hello from the booth.' })),
    ...overrides.transitionWriter,
  };
  return {
    scheduler,
    transitionWriter,
    refillWriter: overrides.refillWriter || { writeRefill: vi.fn(async () => ({ say: '<warm>Fresh tracks.' })) },
    recommender: overrides.recommender || { fillQueue: vi.fn(async () => [{ id: 'fresh' }]) },
    queueStore: overrides.queueStore || {
      upcomingSongs,
      mode: 'auto',
      peek: vi.fn(() => ({ id: 'next-1', title: 'First refill' })),
    },
    weather: overrides.weather || { current: vi.fn(async () => 'Light rain') },
    timeOfDay: overrides.timeOfDay || vi.fn(() => 'evening'),
    promptBuilder: overrides.promptBuilder || vi.fn(() => 'weather prompt'),
    speech: overrides.speech || { synthesize: vi.fn(async () => '/audio/transition.mp3') },
    ttsAvailability: overrides.ttsAvailability || vi.fn(() => true),
    delay: overrides.delay || vi.fn(async () => {}),
  };
}

describe('DjSpeechService', () => {
  it('handleTransitionSpeech_ttsSucceeds_returnsMessageAndSpeechStart', async () => {
    const deps = createDeps();
    const service = createDjSpeechService(deps);

    const result = await service.handleTransitionSpeech({
      prevSong: { id: 'prev' },
      nextSong: { id: 'next' },
      transitionId: 'transition-1',
    });

    expect(deps.weather.current).toHaveBeenCalledOnce();
    expect(deps.timeOfDay).toHaveBeenCalledOnce();
    expect(deps.promptBuilder).toHaveBeenCalledWith({ environment: { weather: 'Light rain' } });
    expect(deps.transitionWriter.writeTransition).toHaveBeenCalledWith({
      prevSong: { id: 'prev' },
      nextSong: { id: 'next' },
      timeOfDay: 'evening',
      contextPrompt: 'weather prompt',
    });
    expect(deps.speech.synthesize).toHaveBeenCalledWith('Hello from the booth.');
    expect(deps.scheduler.speechGenerationDone).toHaveBeenCalledWith(1.4);
    expect(result).toEqual({
      speechHandled: true,
      waitForClient: true,
      resetLastSpeechTime: true,
      djMessage: { text: '<warm>Hello from the booth.' },
      speechStart: {
        audioUrl: '/audio/transition.mp3',
        text: '<warm>Hello from the booth.',
      },
    });
  });

  it('handleTransitionSpeech_ttsUnavailable_pausesThenCompletesSpeech', async () => {
    const deps = createDeps({
      ttsAvailability: vi.fn(() => false),
    });
    const service = createDjSpeechService(deps);

    const result = await service.handleTransitionSpeech({
      prevSong: { id: 'prev' },
      nextSong: { id: 'next' },
      transitionId: 'transition-1',
    });

    expect(deps.speech.synthesize).not.toHaveBeenCalled();
    expect(deps.delay).toHaveBeenCalledWith(3000);
    expect(deps.scheduler.speechComplete).toHaveBeenCalledOnce();
    expect(result).toEqual({
      speechHandled: true,
      completed: true,
      djMessage: { text: '<warm>Hello from the booth.' },
    });
  });

  it('handleTransitionSpeech_staleSpeech_dropsWithoutCompleting', async () => {
    const deps = createDeps({
      scheduler: {
        _transitionId: 'new-transition',
      },
    });
    const service = createDjSpeechService(deps);

    const result = await service.handleTransitionSpeech({
      prevSong: { id: 'prev' },
      nextSong: { id: 'next' },
      transitionId: 'transition-1',
    });

    expect(deps.scheduler.speechGenerationDone).not.toHaveBeenCalled();
    expect(deps.scheduler.speechComplete).not.toHaveBeenCalled();
    expect(result).toEqual({
      stale: true,
      speechHandled: false,
      djMessage: { text: '<warm>Hello from the booth.' },
    });
  });

  it('handleRefillSpeech_whenQueueRefilledAndNextExists_returnsQueueUpdateAndSpeechStart', async () => {
    const deps = createDeps();
    const service = createDjSpeechService(deps);
    const planBlocks = [{ title: 'Night drift' }];

    const result = await service.handleRefillSpeech({
      transitionId: 'transition-1',
      planBlocks,
    });

    expect(deps.recommender.fillQueue).toHaveBeenCalledWith(15, planBlocks);
    expect(deps.queueStore.peek).toHaveBeenCalledOnce();
    expect(deps.weather.current).toHaveBeenCalledOnce();
    expect(deps.timeOfDay).toHaveBeenCalledOnce();
    expect(deps.refillWriter.writeRefill).toHaveBeenCalledWith({
      upcomingSongs: deps.queueStore.upcomingSongs.slice(0, 3),
      weather: 'Light rain',
      timeOfDay: 'evening',
    });
    expect(deps.speech.synthesize).toHaveBeenCalledWith('Fresh tracks.');
    expect(deps.scheduler.speechGenerationDone).toHaveBeenCalledWith(13 / 15);
    expect(result).toEqual({
      speechHandled: true,
      waitForClient: true,
      resetLastSpeechTime: true,
      queueUpdate: {
        upcomingSongs: deps.queueStore.upcomingSongs,
        mode: 'auto',
      },
      djMessage: { text: '<warm>Fresh tracks.' },
      speechStart: {
        audioUrl: '/audio/transition.mp3',
        text: '<warm>Fresh tracks.',
        type: 'refill',
      },
    });
  });

  it('handleRefillSpeech_whenNoNextAfterRefill_completesSpeech', async () => {
    const deps = createDeps({
      queueStore: {
        upcomingSongs: [{ id: 'queued' }],
        mode: 'auto',
        peek: vi.fn(() => null),
      },
    });
    const service = createDjSpeechService(deps);

    const result = await service.handleRefillSpeech({
      transitionId: 'transition-1',
      planBlocks: null,
    });

    expect(deps.refillWriter.writeRefill).not.toHaveBeenCalled();
    expect(deps.scheduler.speechComplete).toHaveBeenCalledOnce();
    expect(result).toEqual({
      speechHandled: true,
      completed: true,
      queueUpdate: {
        upcomingSongs: deps.queueStore.upcomingSongs,
        mode: 'auto',
      },
    });
  });

  it('handleRefillSpeech_ttsUnavailable_pausesThenCompletesSpeech', async () => {
    const deps = createDeps({
      ttsAvailability: vi.fn(() => false),
    });
    const service = createDjSpeechService(deps);

    const result = await service.handleRefillSpeech({
      transitionId: 'transition-1',
      planBlocks: null,
    });

    expect(deps.speech.synthesize).not.toHaveBeenCalled();
    expect(deps.delay).toHaveBeenCalledWith(2500);
    expect(deps.scheduler.speechComplete).toHaveBeenCalledOnce();
    expect(result).toEqual({
      speechHandled: true,
      completed: true,
      queueUpdate: {
        upcomingSongs: deps.queueStore.upcomingSongs,
        mode: 'auto',
      },
      djMessage: { text: '<warm>Fresh tracks.' },
    });
  });
});
