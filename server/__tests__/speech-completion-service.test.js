import { describe, it, expect, vi } from 'vitest';
import { createSpeechCompletionService } from '../application/services/SpeechCompletionService.js';

function createDeps(overrides = {}) {
  const scheduler = {
    coldStartState: 'pending',
    startWithQueue: vi.fn(async () => {}),
    speechComplete: vi.fn(() => {}),
    getState: vi.fn(() => ({ currentSong: { id: 'song-1', title: 'Test' }, isPlaying: true })),
    ...overrides.scheduler,
  };
  const queue = {
    upcomingSongs: [{ id: 's1' }, { id: 's2' }],
    mode: 'shuffle',
    ...overrides.queue,
  };
  return { scheduler, queue };
}

describe('SpeechCompletionService', () => {
  it('handleSpeechFinished_alwaysReturnsSpeechEndAndIdleAnimation', async () => {
    const service = createSpeechCompletionService(createDeps());

    const result = await service.handleSpeechFinished({ type: 'chat' });

    expect(result.speechEnd).toBe(true);
    expect(result.crabAnimation).toEqual({ state: 'idle' });
  });

  it('handleSpeechFinished_coldStart_setsColdStartDone', async () => {
    const deps = createDeps();
    const service = createSpeechCompletionService(deps);

    await service.handleSpeechFinished({ type: 'cold-start' });

    expect(deps.scheduler.coldStartState).toBe('done');
  });

  it('handleSpeechFinished_coldStart_callsStartWithQueue', async () => {
    const deps = createDeps();
    const service = createSpeechCompletionService(deps);

    await service.handleSpeechFinished({ type: 'cold-start' });

    expect(deps.scheduler.startWithQueue).toHaveBeenCalledOnce();
  });

  it('handleSpeechFinished_coldStart_returnsRadioStateAndQueueUpdate', async () => {
    const service = createSpeechCompletionService(createDeps());

    const result = await service.handleSpeechFinished({ type: 'cold-start' });

    expect(result.radioState).toEqual({ currentSong: { id: 'song-1', title: 'Test' }, isPlaying: true });
    expect(result.queueUpdate).toEqual({ upcomingSongs: [{ id: 's1' }, { id: 's2' }], mode: 'shuffle' });
  });

  it('handleSpeechFinished_normal_callsSpeechComplete', async () => {
    const deps = createDeps();
    const service = createSpeechCompletionService(deps);

    await service.handleSpeechFinished({ type: 'transition' });

    expect(deps.scheduler.speechComplete).toHaveBeenCalledOnce();
  });

  it('handleSpeechFinished_normal_doesNotCallStartWithQueue', async () => {
    const deps = createDeps();
    const service = createSpeechCompletionService(deps);

    await service.handleSpeechFinished({ type: 'transition' });

    expect(deps.scheduler.startWithQueue).not.toHaveBeenCalled();
  });

  it('handleSpeechFinished_normal_returnsRadioStateAndQueueUpdate', async () => {
    const service = createSpeechCompletionService(createDeps());

    const result = await service.handleSpeechFinished({ type: 'transition' });

    expect(result.radioState).toBeDefined();
    expect(result.queueUpdate).toBeDefined();
  });

  it('handleSpeechFinished_chat_doesNotTouchScheduler', async () => {
    const deps = createDeps();
    const service = createSpeechCompletionService(deps);

    await service.handleSpeechFinished({ type: 'chat' });

    expect(deps.scheduler.speechComplete).not.toHaveBeenCalled();
    expect(deps.scheduler.startWithQueue).not.toHaveBeenCalled();
    expect(deps.scheduler.coldStartState).toBe('pending');
  });

  it('handleSpeechFinished_chatAnnounce_doesNotTouchScheduler', async () => {
    const deps = createDeps();
    const service = createSpeechCompletionService(deps);

    await service.handleSpeechFinished({ type: 'chat-announce' });

    expect(deps.scheduler.speechComplete).not.toHaveBeenCalled();
    expect(deps.scheduler.startWithQueue).not.toHaveBeenCalled();
  });

  it('handleSpeechFinished_chat_returnsNoRadioStateOrQueueUpdate', async () => {
    const service = createSpeechCompletionService(createDeps());

    const result = await service.handleSpeechFinished({ type: 'chat' });

    expect(result.radioState).toBeUndefined();
    expect(result.queueUpdate).toBeUndefined();
  });

  it('handleSpeechFinished_undefinedType_treatedAsNormal', async () => {
    const deps = createDeps();
    const service = createSpeechCompletionService(deps);

    await service.handleSpeechFinished({});

    expect(deps.scheduler.speechComplete).toHaveBeenCalledOnce();
  });

  it('handleSpeechFinished_nullData_treatedAsNormal', async () => {
    const deps = createDeps();
    const service = createSpeechCompletionService(deps);

    await service.handleSpeechFinished(null);

    expect(deps.scheduler.speechComplete).toHaveBeenCalledOnce();
  });
});
