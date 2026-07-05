import { describe, it, expect, vi } from 'vitest';
import { createColdStartService } from '../application/services/ColdStartService.js';

function createDeps(overrides = {}) {
  const queue = {
    hasCurrent: true,
    current: { id: 'first' },
    future: [],
    advance: vi.fn(),
    upcomingSongs: [{ id: 'next' }],
    mode: 'sequential',
    ...overrides.queue,
  };
  const scheduler = {
    coldStartState: 'in-progress',
    isPlaying: false,
    isAdvancing: false,
    playhead: { currentSong: null },
    startWithQueue: vi.fn(async () => {}),
    getState: vi.fn(() => ({ currentSong: { id: 'first' } })),
    ...overrides.scheduler,
  };
  const speech = {
    synthesize: vi.fn(async () => '/audio/open.mp3'),
    health: vi.fn(() => ({ reason: 'Both providers failed' })),
    ...overrides.speech,
  };

  return {
    queue,
    scheduler,
    speech,
    ttsAvailability: overrides.ttsAvailability || vi.fn(() => true),
    delay: overrides.delay || vi.fn(async () => {}),
    weather: overrides.weather || { current: vi.fn(async () => 'Light rain') },
    timeOfDay: overrides.timeOfDay || vi.fn(() => 'evening'),
    introWriter: overrides.introWriter || {
      writeIntro: vi.fn(async ({ onToken }) => {
        onToken?.('Welcome');
        return 'Welcome to Qclaudio 88.7';
      }),
    },
    messageId: overrides.messageId || vi.fn(() => 'cold-1'),
  };
}

describe('ColdStartService', () => {
  it('beginIfReady_pendingWithFutureOnly_advancesQueueAndMarksInProgress', () => {
    const deps = createDeps({
      queue: {
        hasCurrent: false,
        current: { id: 'advanced' },
        future: [{ id: 'advanced' }],
      },
      scheduler: {
        coldStartState: 'pending',
      },
    });
    deps.queue.advance.mockImplementation(() => {
      deps.queue.hasCurrent = true;
    });
    const service = createColdStartService(deps);

    const result = service.beginIfReady();

    expect(deps.queue.advance).toHaveBeenCalledOnce();
    expect(deps.scheduler.coldStartState).toBe('in-progress');
    expect(result).toEqual({
      shouldStart: true,
      firstSong: { id: 'advanced' },
    });
  });

  it('beginIfReady_whenSchedulerIsBusy_returnsNotStarted', () => {
    const deps = createDeps({
      scheduler: {
        coldStartState: 'pending',
        isPlaying: true,
      },
    });
    const service = createColdStartService(deps);

    const result = service.beginIfReady();

    expect(result).toEqual({ shouldStart: false });
    expect(deps.scheduler.coldStartState).toBe('pending');
    expect(deps.queue.advance).not.toHaveBeenCalled();
  });

  it('startMusicIfStillInProgress_whenInProgress_startsMusicAndReturnsStateQueue', async () => {
    const deps = createDeps();
    const service = createColdStartService(deps);

    const result = await service.startMusicIfStillInProgress();

    expect(deps.scheduler.coldStartState).toBe('done');
    expect(deps.scheduler.startWithQueue).toHaveBeenCalledOnce();
    expect(result).toEqual({
      radioState: { currentSong: { id: 'first' } },
      queueUpdate: { upcomingSongs: [{ id: 'next' }], mode: 'sequential' },
    });
  });

  it('startMusicIfStillInProgress_whenAlreadyDone_isNoOp', async () => {
    const deps = createDeps({
      scheduler: {
        coldStartState: 'done',
      },
    });
    const service = createColdStartService(deps);

    const result = await service.startMusicIfStillInProgress();

    expect(result).toBeNull();
    expect(deps.scheduler.startWithQueue).not.toHaveBeenCalled();
  });

  it('handleGeneratedIntro_ttsSucceeds_returnsSpeechStartWithoutStartingMusic', async () => {
    const deps = createDeps();
    const service = createColdStartService(deps);

    const result = await service.handleGeneratedIntro({ fullText: '<warm>欢迎收听。今晚第一首歌马上来。' });

    expect(deps.speech.synthesize).toHaveBeenCalledWith('欢迎收听。今晚第一首歌马上来。');
    expect(deps.scheduler.startWithQueue).not.toHaveBeenCalled();
    expect(result).toEqual({
      speechStart: {
        audioUrl: '/audio/open.mp3',
        text: '<warm>欢迎收听。今晚第一首歌马上来。',
        type: 'cold-start',
      },
    });
  });

  it('handleGeneratedIntro_firstAttemptFails_retriesWithShorterText', async () => {
    const deps = createDeps({
      speech: {
        synthesize: vi.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce('/audio/retry.mp3'),
        health: vi.fn(() => ({ reason: '' })),
      },
    });
    const service = createColdStartService(deps);

    const result = await service.handleGeneratedIntro({
      fullText: '第一句用于欢迎。第二句用于介绍。第三句不该进入重试。',
    });

    expect(deps.speech.synthesize).toHaveBeenNthCalledWith(1, '第一句用于欢迎。第二句用于介绍。第三句不该进入重试。');
    expect(deps.speech.synthesize).toHaveBeenNthCalledWith(2, '第一句用于欢迎。第二句用于介绍。');
    expect(deps.delay).toHaveBeenCalledWith(1000);
    expect(result.speechStart.audioUrl).toBe('/audio/retry.mp3');
  });

  it('handleGeneratedIntro_ttsUnavailable_startsMusicAfterTextOnlyPhase', async () => {
    const deps = createDeps({
      ttsAvailability: vi.fn(() => false),
    });
    const service = createColdStartService(deps);

    const result = await service.handleGeneratedIntro({ fullText: '今晚先用文字开场。' });

    expect(deps.speech.synthesize).not.toHaveBeenCalled();
    expect(deps.delay).toHaveBeenCalledWith(3500);
    expect(deps.scheduler.coldStartState).toBe('done');
    expect(deps.scheduler.startWithQueue).toHaveBeenCalledOnce();
    expect(result).toEqual({
      textOnlyPhase: {
        phase: 'text-only',
        text: '今晚先用文字开场。',
        reason: 'Both providers failed',
      },
      radioState: { currentSong: { id: 'first' } },
      queueUpdate: { upcomingSongs: [{ id: 'next' }], mode: 'sequential' },
    });
  });

  it('startMusicDirectly_coldOpenFails_startsMusicAndReturnsStateQueue', async () => {
    const deps = createDeps();
    const service = createColdStartService(deps);

    const result = await service.startMusicDirectly();

    expect(deps.scheduler.coldStartState).toBe('done');
    expect(deps.scheduler.startWithQueue).toHaveBeenCalledOnce();
    expect(result).toEqual({
      radioState: { currentSong: { id: 'first' } },
      queueUpdate: { upcomingSongs: [{ id: 'next' }], mode: 'sequential' },
    });
  });

  it('writeIntro_streamsColdOpenWithWeatherTimeAndMessageId', async () => {
    const firstSong = { id: 'first', title: 'First Light' };
    const chunks = [];
    const phases = [];
    const deps = createDeps();
    const service = createColdStartService(deps);

    const result = await service.writeIntro({
      firstSong,
      onChunk: payload => chunks.push(payload),
      onPhase: payload => phases.push(payload),
    });

    expect(phases).toEqual([{ phase: 'writing' }]);
    expect(deps.weather.current).toHaveBeenCalledOnce();
    expect(deps.timeOfDay).toHaveBeenCalledOnce();
    expect(deps.introWriter.writeIntro).toHaveBeenCalledWith(expect.objectContaining({
      firstSong,
      weather: 'Light rain',
      timeOfDay: 'evening',
    }));
    expect(chunks).toEqual([{ messageId: 'cold-1', token: 'Welcome' }]);
    expect(result).toEqual({
      messageId: 'cold-1',
      fullText: 'Welcome to Qclaudio 88.7',
      streamEnd: {
        messageId: 'cold-1',
        fullText: 'Welcome to Qclaudio 88.7',
      },
    });
  });

  it('writeIntro_whenWriterReturnsEmptyText_returnsEmptyStreamEnd', async () => {
    const deps = createDeps({
      introWriter: {
        writeIntro: vi.fn(async () => ''),
      },
    });
    const service = createColdStartService(deps);

    const result = await service.writeIntro({
      firstSong: { id: 'first' },
      onChunk: vi.fn(),
      onPhase: vi.fn(),
    });

    expect(result).toEqual({
      messageId: 'cold-1',
      fullText: '',
      streamEnd: {
        messageId: 'cold-1',
        fullText: '',
      },
    });
  });
});
