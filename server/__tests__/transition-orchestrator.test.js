import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransitionOrchestrator } from '../domain/playback/TransitionOrchestrator.js';

describe('TransitionOrchestrator', () => {
  let orch;
  let playhead;
  let queueMock;
  let listenHistoryMock;
  let onDjSpeechNeeded;
  let onAdvance;

  beforeEach(() => {
    playhead = {
      currentSong: { id: 's1', ar: [{ name: 'Artist' }], dt: 180000 },
      songDuration: 180000,
      isPlaying: true,
      startedAt: Date.now() - 170000,
      _advancing: false,
      transitionTimer: null,
    };
    queueMock = {
      peek: vi.fn(() => ({ id: 's2', ar: [{ name: 'Artist2' }], dt: 200000 })),
      advance: vi.fn(() => ({ id: 's2', ar: [{ name: 'Artist2' }], dt: 200000 })),
    };
    listenHistoryMock = { record: vi.fn() };
    onDjSpeechNeeded = vi.fn();
    onAdvance = vi.fn();

    orch = new TransitionOrchestrator({
      playhead,
      queue: queueMock,
      listenHistory: listenHistoryMock,
      onDjSpeechNeeded,
      onAdvance,
    });
  });

  it('doesNothing_whenTransitionAlreadyInProgress', () => {
    playhead._advancing = true;
    const result = orch.onSongEnding();
    expect(result.started).toBe(false);
    expect(onDjSpeechNeeded).not.toHaveBeenCalled();
  });

  it('startsTransition_andRecordsHistory', () => {
    const result = orch.onSongEnding();
    expect(result.started).toBe(true);
    expect(result.transitionId).toBeGreaterThan(0);
    expect(listenHistoryMock.record).toHaveBeenCalled();
  });

  it('callsOnDjSpeechNeeded_withPrevAndNextSong', () => {
    const result = orch.onSongEnding();
    expect(onDjSpeechNeeded).toHaveBeenCalledWith(
      playhead.currentSong,
      expect.objectContaining({ id: 's2' }),
      result.transitionId,
    );
  });

  it('advances_whenNoDjSpeechCallback', () => {
    orch.onDjSpeechNeeded = null;
    orch.onSongEnding();
    expect(onAdvance).toHaveBeenCalled();
  });

  it('speechGenerationDone_startsPlaybackTimer', () => {
    orch.onSongEnding();
    expect(() => orch.speechGenerationDone(8)).not.toThrow();
  });

  it('speechComplete_advancesToNext', () => {
    orch.onSongEnding();
    orch.speechComplete();
    expect(onAdvance).toHaveBeenCalled();
  });

  it('speechComplete_doesNotAdvance_whenNotAdvancing', () => {
    orch.onSongEnding();
    // Simulate a skip that cancels the transition
    playhead._advancing = false;
    orch.speechComplete();
    expect(onAdvance).not.toHaveBeenCalled();
  });

  it('cancel_disposesSpeechTimer', () => {
    orch.onSongEnding();
    expect(() => orch.cancel()).not.toThrow();
  });

  it('handlesRefillTransition_withLongerTimeout', () => {
    queueMock.peek.mockReturnValue(null); // No next song → refill
    const result = orch.onSongEnding();
    expect(result.started).toBe(true);
    expect(result.kind).toBe('refill');
    expect(onDjSpeechNeeded).toHaveBeenCalled();
  });

  it('handlesRefillNextSong_fromRecommender', () => {
    const refillSong = { id: 'refilled', ar: [{ name: 'NewArtist' }], dt: 200000 };
    queueMock.peek.mockReturnValue(null); // Queue exhausted
    orch = new TransitionOrchestrator({
      playhead,
      queue: queueMock,
      listenHistory: listenHistoryMock,
      onDjSpeechNeeded,
      onAdvance,
      refillSongProvider: vi.fn().mockReturnValue(refillSong),
    });
    const result = orch.onSongEnding();
    expect(result.started).toBe(true);
    expect(onDjSpeechNeeded).toHaveBeenCalledWith(
      playhead.currentSong,
      expect.objectContaining({ id: 'refilled' }),
      result.transitionId,
    );
  });

  it('isAdvancing_returnsFalse_beforeTransition', () => {
    expect(orch.isAdvancing).toBe(false);
  });

  it('isAdvancing_returnsTrue_afterTransitionStarts', () => {
    orch.onSongEnding();
    expect(orch.isAdvancing).toBe(true);
  });

  it('isAdvancing_returnsFalse_afterSpeechComplete', () => {
    orch.onSongEnding();
    orch.speechComplete();
    expect(orch.isAdvancing).toBe(false);
  });
});
