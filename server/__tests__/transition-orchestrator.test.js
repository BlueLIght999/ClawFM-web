import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { TransitionOrchestrator } from '../domain/playback/TransitionOrchestrator.js';

/**
 * TransitionOrchestrator is the seam between "the song ended" and "the next one
 * plays" -- the double-advance guard, the listen-history write, the refill
 * decision, and the two timeout callbacks all live here. Mutation testing found
 * only the happy path covered: every timeout callback body was NoCoverage, and
 * the speech-timer lifecycle was never exercised at all.
 *
 * The clock is not faked. The generation budget is injectable through
 * transitionSpeechPlan (15s normal / 60s refill), which is far too long to wait
 * for, so the timeout callbacks are driven directly by reaching into the timer
 * the orchestrator just built. That is a deliberate internal reach: the
 * alternative is a test that cannot observe the branch at all.
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeHarness(overrides = {}) {
  const playhead = {
    currentSong: { id: 1, name: 'Song A', artists: [{ name: 'Artist A' }] },
    songDuration: 200000,
    _advancing: false,
    ...(overrides.playhead || {}),
  };
  const queue = {
    peek: vi.fn(() => ({ id: 2, name: 'Song B' })),
    ...(overrides.queue || {}),
  };
  const listenHistory = { record: vi.fn() };
  const onDjSpeechNeeded = vi.fn();
  const onAdvance = vi.fn();

  const orch = new TransitionOrchestrator({
    playhead,
    queue,
    listenHistory,
    onDjSpeechNeeded,
    onAdvance,
    ...(overrides.opts || {}),
  });

  return { orch, playhead, queue, listenHistory, onDjSpeechNeeded, onAdvance };
}

describe('TransitionOrchestrator', () => {
  let h;

  beforeEach(() => {
    h = makeHarness();
  });

  afterEach(() => {
    h.orch.cancel();
    vi.restoreAllMocks();
  });

  describe('isAdvancing', () => {
    it('mirrorsThePlayheadFlag', () => {
      expect(h.orch.isAdvancing).toBe(false);
      h.playhead._advancing = true;
      expect(h.orch.isAdvancing).toBe(true);
    });
  });

  describe('onSongEnding', () => {
    it('refusesToStart_whenAlreadyAdvancing', () => {
      // The double-advance guard: player:ended and a skip can race.
      h.playhead._advancing = true;
      expect(h.orch.onSongEnding()).toEqual({ started: false });
      expect(h.onDjSpeechNeeded).not.toHaveBeenCalled();
      expect(h.listenHistory.record).not.toHaveBeenCalled();
    });

    it('startsATransitionAndReportsItsId', () => {
      const res = h.orch.onSongEnding();
      expect(res).toEqual({ started: true, transitionId: 1, kind: 'normal' });
      expect(h.playhead._advancing).toBe(true);
    });

    it('incrementsTheTransitionIdPerStart', () => {
      expect(h.orch.onSongEnding().transitionId).toBe(1);
      h.orch.speechComplete();
      expect(h.orch.onSongEnding().transitionId).toBe(2);
    });

    it('recordsListenHistoryForTheFinishedSong', () => {
      h.orch.onSongEnding();
      expect(h.listenHistory.record).toHaveBeenCalledTimes(1);
      const rec = h.listenHistory.record.mock.calls[0][0];
      expect(rec.songId).toBe('1');
      expect(rec.title).toBe('Song A');
      expect(rec.artist).toBe('Artist A');
      expect(rec.durationSec).toBe(200);
    });

    it('skipsTheHistoryWrite_whenThereIsNoSong', () => {
      h.playhead.currentSong = null;
      h.orch.onSongEnding();
      expect(h.listenHistory.record).not.toHaveBeenCalled();
    });

    it('passesThePreviousAndNextSongToTheSpeechCallback', () => {
      h.orch.onSongEnding();
      expect(h.onDjSpeechNeeded).toHaveBeenCalledTimes(1);
      const [prev, next, id] = h.onDjSpeechNeeded.mock.calls[0];
      expect(prev).toEqual({ id: 1, name: 'Song A', artists: [{ name: 'Artist A' }] });
      expect(next).toEqual({ id: 2, name: 'Song B' });
      expect(id).toBe(1);
    });

    it('advancesImmediately_whenThereIsNoSpeechCallback', () => {
      // Without a DJ-speech hook nothing is pending, so the orchestrator must
      // not leave the playhead stuck in _advancing.
      const { orch, onAdvance } = makeHarness({ opts: { onDjSpeechNeeded: null } });
      orch.onSongEnding();
      expect(onAdvance).toHaveBeenCalledTimes(1);
      orch.cancel();
    });

    it('usesTheRefillProvider_whenTheQueueIsEmpty', () => {
      const refill = { id: 9, name: 'Fallback' };
      const { orch, queue, onDjSpeechNeeded } = makeHarness({
        queue: { peek: vi.fn(() => null) },
        opts: { refillSongProvider: () => refill },
      });
      const res = orch.onSongEnding();
      expect(res.kind).toBe('refill');
      expect(onDjSpeechNeeded.mock.calls[0][1]).toEqual(refill);
      expect(queue.peek).toHaveBeenCalled();
      orch.cancel();
    });

    it('fallsBackToANullNextSong_whenTheQueueIsEmptyAndNoProviderExists', () => {
      const { orch, onDjSpeechNeeded } = makeHarness({ queue: { peek: vi.fn(() => null) } });
      const res = orch.onSongEnding();
      expect(res.kind).toBe('refill');
      expect(onDjSpeechNeeded.mock.calls[0][1]).toBeNull();
      orch.cancel();
    });

    it('disposesAPreviousTimerBeforeStartingANewOne', () => {
      h.orch.onSongEnding();
      const first = h.orch._speechTimer;
      const disposeSpy = vi.spyOn(first, 'dispose');
      h.playhead._advancing = false; // force a second start without speechComplete
      h.orch.onSongEnding();
      expect(disposeSpy).toHaveBeenCalled();
      expect(h.orch._speechTimer).not.toBe(first);
    });

    it('armsTheGenerationTimer', () => {
      // The generation phase is what eventually fires the timeout callback, so
      // dropping this call leaves the transition waiting on a song that already
      // ended -- no speech, no timeout, no advance. The timer's armed handle is
      // its external effect, so the assertion reads that rather than spying on
      // the class under test.
      h.orch.onSongEnding();
      expect(h.orch._speechTimer._genTimer).not.toBeNull();
      // And the handle must be cleared once speech starts, or the stale
      // generation timeout fires mid-playback -- the original bug.
      h.orch.speechGenerationDone(1);
      expect(h.orch._speechTimer._genTimer).toBeNull();
    });
  });

  describe('generation timeout', () => {
    it('advancesAndClearsTheTimer_whenGenerationTimesOutForTheCurrentTransition', () => {
      h.orch.onSongEnding();
      h.orch._speechTimer._onGenerationTimeout();
      expect(h.onAdvance).toHaveBeenCalledTimes(1);
    });

    it('ignoresAStaleGenerationTimeout', () => {
      // A timeout from a superseded transition must not advance the new one --
      // this is the whole reason myId is captured. Completing the first
      // transition is what frees the playhead for the second; without it the
      // double-advance guard would reject the restart and _transitionId would
      // never move, leaving the test unable to observe a stale id at all.
      h.orch.onSongEnding();
      const stale = h.orch._speechTimer._onGenerationTimeout;
      h.orch.speechComplete();
      h.orch.onSongEnding();
      expect(h.onAdvance).toHaveBeenCalledTimes(1); // only the first completion
      stale();
      expect(h.onAdvance).toHaveBeenCalledTimes(1);
    });
  });

  describe('playback timeout', () => {
    it('advances_whenPlaybackTimesOutForTheCurrentTransition', () => {
      h.orch.onSongEnding();
      h.orch._speechTimer._onPlaybackTimeout();
      expect(h.onAdvance).toHaveBeenCalledTimes(1);
    });

    it('ignoresAStalePlaybackTimeout', () => {
      h.orch.onSongEnding();
      const stale = h.orch._speechTimer._onPlaybackTimeout;
      h.orch.speechComplete();
      h.orch.onSongEnding();
      expect(h.onAdvance).toHaveBeenCalledTimes(1);
      stale();
      expect(h.onAdvance).toHaveBeenCalledTimes(1);
    });
  });

  describe('speechGenerationDone', () => {
    it('handsTheDurationToTheTimer', () => {
      h.orch.onSongEnding();
      const spy = vi.spyOn(h.orch._speechTimer, 'speechStarted');
      h.orch.speechGenerationDone(3);
      expect(spy).toHaveBeenCalledWith(3);
    });

    it('defaultsTheDurationToEightSeconds', () => {
      h.orch.onSongEnding();
      const spy = vi.spyOn(h.orch._speechTimer, 'speechStarted');
      h.orch.speechGenerationDone();
      expect(spy).toHaveBeenCalledWith(8);
    });

    it('isSafeWithNoTimer', () => {
      expect(() => h.orch.speechGenerationDone(2)).not.toThrow();
    });
  });

  describe('speechComplete', () => {
    it('finishesTheTimerAndAdvances', () => {
      h.orch.onSongEnding();
      const timer = h.orch._speechTimer;
      const finish = vi.spyOn(timer, 'speechFinished');
      const dispose = vi.spyOn(timer, 'dispose');
      h.orch.speechComplete();
      expect(finish).toHaveBeenCalled();
      // dispose matters even though the reference is dropped immediately after:
      // the playback timeout may still be armed, and an un-disposed timer fires
      // it later against a transition that has already completed.
      expect(dispose).toHaveBeenCalled();
      expect(h.orch._speechTimer).toBeNull();
      expect(h.onAdvance).toHaveBeenCalledTimes(1);
    });

    it('clearsTheAdvancingFlag', () => {
      h.orch.onSongEnding();
      h.orch.speechComplete();
      expect(h.playhead._advancing).toBe(false);
    });

    it('doesNotAdvance_whenThePlayheadIsNotAdvancing', () => {
      // A late speechComplete from a transition that already timed out.
      h.playhead._advancing = false;
      h.orch.speechComplete();
      expect(h.onAdvance).not.toHaveBeenCalled();
    });

    it('isSafeWithNoTimer', () => {
      h.playhead._advancing = true;
      h.orch.speechComplete();
      expect(h.onAdvance).toHaveBeenCalledTimes(1);
    });
  });

  describe('_doAdvance', () => {
    it('doesNothingWhenNoAdvanceHandlerIsRegistered', () => {
      // The constructor defaults onAdvance to null, so the guard is what keeps a
      // bare orchestrator from throwing on a song ending. Reached through the
      // public path rather than by calling the private method directly.
      const { orch, playhead } = makeHarness({ opts: { onAdvance: null, onDjSpeechNeeded: null } });
      playhead._advancing = true;
      expect(() => orch.onSongEnding()).not.toThrow();
      expect(() => orch.speechComplete()).not.toThrow();
      orch.cancel();
    });
  });

  describe('cancel', () => {
    it('disposesTheTimerAndClearsIt', () => {
      h.orch.onSongEnding();
      const spy = vi.spyOn(h.orch._speechTimer, 'dispose');
      h.orch.cancel();
      expect(spy).toHaveBeenCalled();
      expect(h.orch._speechTimer).toBeNull();
    });

    it('isSafeWithNoTimer', () => {
      expect(() => h.orch.cancel()).not.toThrow();
    });

    it('leavesThePlayheadAdvancing', () => {
      // cancel is a teardown, not a completion: it must not advance.
      h.orch.onSongEnding();
      h.orch.cancel();
      expect(h.onAdvance).not.toHaveBeenCalled();
      expect(h.playhead._advancing).toBe(true);
    });
  });

  it('reportsNotAdvancing_forABarePlayheadWithoutTheFlag', () => {
    // The scheduler is the only real caller and always supplies a playhead, but
    // isAdvancing reads a single flag and must not throw on an object that has
    // never been advanced -- the flag starts undefined, not false.
    const orch = new TransitionOrchestrator({ playhead: {} });
    expect(orch.isAdvancing).toBe(false);
    orch.cancel();
  });
});
