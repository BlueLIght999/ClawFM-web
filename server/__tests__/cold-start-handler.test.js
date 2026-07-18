import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pushBubbles to avoid importing bubbleHandler dependencies
vi.mock('../socket/bubbleHandler.js', () => ({
  pushBubbles: vi.fn(),
}));

import { triggerColdStart, triggerColdStartIfPending } from '../socket/coldStartHandler.js';

describe('coldStartHandler — triggerColdStart', () => {
  let io, deps, coldStartService;

  beforeEach(() => {
    io = { emit: vi.fn() };
    coldStartService = {
      beginIfReady: vi.fn(),
      writeIntro: vi.fn(),
      handleGeneratedIntro: vi.fn(),
      startMusicDirectly: vi.fn(),
      startMusicIfStillInProgress: vi.fn(),
    };
    deps = {
      coldStartService,
      chatHistory: { append: vi.fn() },
      queue: { upcomingSongs: [] },
    };
  });

  it('doesNothing_whenNotReady', async () => {
    coldStartService.beginIfReady.mockReturnValue({ shouldStart: false });
    await triggerColdStart(io, deps);
    expect(coldStartService.writeIntro).not.toHaveBeenCalled();
  });

  it('callsWriteIntro_whenReady', async () => {
    coldStartService.beginIfReady.mockReturnValue({ shouldStart: true, firstSong: { id: 's1' } });
    coldStartService.writeIntro.mockResolvedValue({
      fullText: 'Welcome to the radio!',
      streamEnd: { text: 'Welcome to the radio!', timestamp: 123 },
    });
    coldStartService.handleGeneratedIntro.mockResolvedValue({ speechStart: null });
    await triggerColdStart(io, deps);
    expect(coldStartService.writeIntro).toHaveBeenCalledWith(
      expect.objectContaining({ firstSong: { id: 's1' } }),
    );
  });

  it('emitsDjStreamEnd_withStreamEndObject', async () => {
    coldStartService.beginIfReady.mockReturnValue({ shouldStart: true, firstSong: null });
    coldStartService.writeIntro.mockResolvedValue({
      fullText: 'Hello',
      streamEnd: { text: 'Hello', timestamp: 999 },
    });
    coldStartService.handleGeneratedIntro.mockResolvedValue({ speechStart: null });
    await triggerColdStart(io, deps);
    expect(io.emit).toHaveBeenCalledWith('radio:dj-stream-end', { text: 'Hello', timestamp: 999 });
  });

  it('emitsDjMessage_andAppendsChat_whenFullText', async () => {
    coldStartService.beginIfReady.mockReturnValue({ shouldStart: true, firstSong: null });
    coldStartService.writeIntro.mockResolvedValue({
      fullText: 'Good morning!',
      streamEnd: { text: 'Good morning!', timestamp: 1 },
    });
    coldStartService.handleGeneratedIntro.mockResolvedValue({ speechStart: null });
    await triggerColdStart(io, deps);
    expect(io.emit).toHaveBeenCalledWith('radio:dj-message', expect.objectContaining({ text: 'Good morning!' }));
    expect(deps.chatHistory.append).toHaveBeenCalledWith('assistant', 'Good morning!');
  });

  it('emitsDjSpeechStart_afterHandleGeneratedIntro', async () => {
    coldStartService.beginIfReady.mockReturnValue({ shouldStart: true, firstSong: null });
    coldStartService.writeIntro.mockResolvedValue({
      fullText: 'Hi',
      streamEnd: { text: 'Hi', timestamp: 1 },
    });
    coldStartService.handleGeneratedIntro.mockResolvedValue({ speechStart: 'url.mp3' });
    await triggerColdStart(io, deps);
    // emitColdStartResult emits DJ_SPEECH_START with the speech URL
    expect(io.emit).toHaveBeenCalledWith('radio:dj-speech-start', 'url.mp3');
  });

  it('fallsBackToStartMusicDirectly_onError', async () => {
    coldStartService.beginIfReady.mockReturnValue({ shouldStart: true, firstSong: null });
    coldStartService.writeIntro.mockRejectedValue(new Error('LLM down'));
    coldStartService.startMusicDirectly.mockResolvedValue({ speechStart: null });
    await triggerColdStart(io, deps);
    expect(coldStartService.startMusicDirectly).toHaveBeenCalled();
  });

  it('throwsOnEmptyText_fallsBackToDirectStart', async () => {
    coldStartService.beginIfReady.mockReturnValue({ shouldStart: true, firstSong: null });
    coldStartService.writeIntro.mockResolvedValue({
      fullText: '',
      streamEnd: { text: '', timestamp: 1 },
    });
    coldStartService.startMusicDirectly.mockResolvedValue({ speechStart: null });
    await triggerColdStart(io, deps);
    expect(coldStartService.startMusicDirectly).toHaveBeenCalled();
  });

  // ── P0-1: beginIfReady failure must log (not silent) ──

  it('logsWarning_whenBeginIfReadyReturnsFalse', async () => {
    const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
    deps.logger = logger;
    deps.scheduler = { coldStartState: 'pending', isPlaying: false, isAdvancing: false, playhead: { currentSong: null } };
    deps.queue = { hasCurrent: false, upcomingSongs: [], future: [], mode: 'sequential' };
    coldStartService.beginIfReady.mockReturnValue({ shouldStart: false });
    await triggerColdStart(io, deps);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ component: 'cold-start' }),
      expect.stringContaining('not ready'),
    );
  });
});

// ── P0-2: triggerColdStartIfPending — re-trigger after queue fill ──

describe('coldStartHandler — triggerColdStartIfPending', () => {
  let io, deps, coldStartService;

  beforeEach(() => {
    io = { emit: vi.fn() };
    coldStartService = {
      beginIfReady: vi.fn(),
      writeIntro: vi.fn(),
      handleGeneratedIntro: vi.fn(),
      startMusicDirectly: vi.fn(),
      startMusicIfStillInProgress: vi.fn(),
    };
    deps = {
      coldStartService,
      chatHistory: { append: vi.fn() },
      queue: { upcomingSongs: [], hasCurrent: true, future: [], mode: 'sequential' },
      logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
    };
  });

  it('triggersColdStart_whenColdStartStatePending', async () => {
    deps.scheduler = { coldStartState: 'pending', isPlaying: false, isAdvancing: false, playhead: { currentSong: null } };
    coldStartService.beginIfReady.mockReturnValue({ shouldStart: false });
    const result = await triggerColdStartIfPending(io, deps);
    expect(coldStartService.beginIfReady).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('skipsTrigger_whenColdStartStateDone', async () => {
    deps.scheduler = { coldStartState: 'done' };
    const result = await triggerColdStartIfPending(io, deps);
    expect(coldStartService.beginIfReady).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it('skipsTrigger_whenColdStartStateInProgress', async () => {
    deps.scheduler = { coldStartState: 'in-progress' };
    const result = await triggerColdStartIfPending(io, deps);
    expect(coldStartService.beginIfReady).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it('skipsTrigger_whenNoScheduler', async () => {
    delete deps.scheduler;
    const result = await triggerColdStartIfPending(io, deps);
    expect(coldStartService.beginIfReady).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });
});
