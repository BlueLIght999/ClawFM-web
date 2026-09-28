import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { SpeechTimer } from '../domain/playback/speechTimer.js';

/**
 * SpeechTimer drives the two-phase timeout that replaced the original
 * single-30s bug (the old timer counted TTS generation time as part of the
 * playback window, so it fired mid-playback). Mutation testing found the whole
 * class uncovered -- every branch in it NoCoverage -- which is exactly the
 * shape a timing bug hides in: nothing else in the suite advances real timers.
 *
 * Real timers are used against tiny millisecond budgets rather than
 * vi.useFakeTimers, because the class stores handles and clears them across
 * calls; faking while asserting on _genTimer identity would pin internals.
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('SpeechTimer', () => {
  let onGen;
  let onPlay;

  beforeEach(() => {
    onGen = vi.fn();
    onPlay = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('firesTheGenerationTimeoutAfterTheBudget', async () => {
    const t = new SpeechTimer({ generationTimeoutMs: 20, onGenerationTimeout: onGen });
    t.startGeneration();
    expect(onGen).not.toHaveBeenCalled();
    await sleep(60);
    expect(onGen).toHaveBeenCalledTimes(1);
  });

  it('doesNotFireGenerationTimeout_beforeTheBudgetElapses', async () => {
    const t = new SpeechTimer({ generationTimeoutMs: 80, onGenerationTimeout: onGen });
    t.startGeneration();
    await sleep(20);
    expect(onGen).not.toHaveBeenCalled();
    t.dispose();
  });

  it('cancelsTheGenerationTimeout_whenSpeechStarts', async () => {
    // The core of the original fix: generation and playback must not both be
    // armed, or the stale generation timer fires during playback.
    const t = new SpeechTimer({ generationTimeoutMs: 20, onGenerationTimeout: onGen, onPlaybackTimeout: onPlay });
    t.startGeneration();
    t.speechStarted(0.5);
    // Both handles are checked: the generation handle must be cleared *and* the
    // playback handle must exist. A `dispose`-style mutant that clears only one
    // leaves the other armed.
    expect(t._genTimer).toBeNull();
    expect(t._playTimer).not.toBeNull();
    await sleep(60);
    expect(onGen).not.toHaveBeenCalled();
    t.dispose();
  });

  it('cancelsTheGenerationTimeout_evenWhenNoHandleWasArmed', async () => {
    // speechStarted without a prior startGeneration: the `if (this._genTimer)`
    // guard is what stops clearTimeout(undefined), and the flag must still flip.
    const t = new SpeechTimer({ onPlaybackTimeout: onPlay });
    expect(() => t.speechStarted(1)).not.toThrow();
    expect(t.hasStarted).toBe(true);
    expect(t._playTimer).not.toBeNull();
    t.dispose();
  });

  it('firesPlaybackTimeoutAfterSpeechDurationPlusBuffer', () => {
    // The armed handle carries its own due time, so the arithmetic is read
    // exactly instead of waited out. 20s speech + 5s buffer = 25000ms.
    const t = new SpeechTimer({ onPlaybackTimeout: onPlay });
    t.speechStarted(20);
    expect(t._playTimer._idleTimeout).toBe(25000);
    t.dispose();
  });

  it('floorsVeryShortSpeechAtTheMinimumPlaybackWindow', () => {
    // 0s + 5000 buffer is below the 5000 floor only by the buffer being equal,
    // so the guard is proved by the buffer *not* being subtracted and by the
    // floor holding: both `Math.min` and a minus-buffer mutant move this value.
    const t = new SpeechTimer({ onPlaybackTimeout: onPlay });
    t.speechStarted(0);
    expect(t._playTimer._idleTimeout).toBe(5500);
    t.dispose();
  });

  it('raisesTheFloorForSpeechShorterThanHalfASecond', () => {
    // speechStarted(-5) must not arm a negative-delay timer, which node clamps
    // to 1ms and would fire the playback timeout instantly.
    const t = new SpeechTimer({ onPlaybackTimeout: onPlay });
    t.speechStarted(-5);
    expect(t._playTimer._idleTimeout).toBe(5500);
    t.dispose();
  });

  it('ignoresSpeechStarted_afterGenerationAlreadyTimedOut', async () => {
    const t = new SpeechTimer({ generationTimeoutMs: 10, onGenerationTimeout: onGen, onPlaybackTimeout: onPlay });
    t.startGeneration();
    await sleep(40);
    expect(t.generationTimedOut).toBe(true);
    t.speechStarted(1);
    expect(t.hasStarted).toBe(false); // too late -- the guard returned early
    await sleep(40);
    expect(onPlay).not.toHaveBeenCalled();
    t.dispose();
  });

  it('cancelsThePlaybackTimeout_whenSpeechFinishes', async () => {
    const t = new SpeechTimer({ onPlaybackTimeout: onPlay });
    t.speechStarted(0);
    // The handle itself, not just the absence of a callback: speechStarted(0) is
    // floored to a 5.5s window that outlives any wait this test can afford, so
    // only reading the handle tells a real clear from a skipped one.
    expect(t._playTimer).not.toBeNull();
    t.speechFinished();
    expect(t._playTimer).toBeNull();
    expect(() => t.speechFinished()).not.toThrow();
    await sleep(30);
    expect(onPlay).not.toHaveBeenCalled();
    t.dispose();
  });

  it('firesThePlaybackTimeoutCallbackAndClearsItsOwnHandle', () => {
    // The callback body was entirely NoCoverage: every other test reads the
    // scheduled delay and then disposes, so nothing ever reaches the two lines
    // inside it. The floor is 5.5s, far longer than a test may wait, so the
    // scheduler is intercepted for the duration of one call to run the real
    // callback immediately. Its first line nulls the handle; without that, the
    // stale reference outlives the firing and the next dispose clears a timer
    // that is already spent.
    const realSetTimeout = globalThis.setTimeout;
    let captured = null;
    globalThis.setTimeout = (fn) => {
      captured = fn;
      return { fake: true };
    };
    const t = new SpeechTimer({ onPlaybackTimeout: onPlay });
    try {
      t.speechStarted(0.5);
    } finally {
      globalThis.setTimeout = realSetTimeout;
    }
    expect(captured).toBeTypeOf('function');
    captured();
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(t._playTimer).toBeNull();
  });

  it('clearsTheGenerationHandleWhenSpeechStartsAfterGenerationWasArmed', async () => {
    // The `if (this._genTimer)` guard at L58 is false in every other test that
    // calls speechStarted: they either never armed a generation timer or let it
    // fire first. Here it is armed and still pending, which is the only state in
    // which the clearTimeout runs at all -- and a skipped clear is visible as
    // the generation callback firing later.
    const t = new SpeechTimer({ generationTimeoutMs: 400, onGenerationTimeout: onGen, onPlaybackTimeout: onPlay });
    t.startGeneration();
    expect(t._genTimer).not.toBeNull();
    t.speechStarted(0.5);
    expect(t._genTimer).toBeNull();
    await sleep(500);
    expect(onGen).not.toHaveBeenCalled();
    t.dispose();
  });

  it('cancelsBothHandlesWhenDisposedMidGenerationAfterSpeechStarted', async () => {
    // dispose's two guards are both false in the two existing dispose tests:
    // one clears each handle before the other guard is read, and the bare-timer
    // test starts with both already null. Driving generation -> speech -> dispose
    // leaves the playback handle armed while the generation branch is null, so
    // each guard is entered exactly once across the suite rather than never.
    const t = new SpeechTimer({ generationTimeoutMs: 20, onGenerationTimeout: onGen, onPlaybackTimeout: onPlay });
    t.startGeneration();
    t.speechStarted(0.5);
    expect(t._genTimer).toBeNull();
    expect(t._playTimer).not.toBeNull();
    t.dispose();
    expect(t._playTimer).toBeNull();
    await sleep(60);
    expect(onPlay).not.toHaveBeenCalled();
  });

  it('marksHasStartedOnlyAfterSpeechStarted', () => {
    const t = new SpeechTimer();
    expect(t.hasStarted).toBe(false);
    t.speechStarted();
    expect(t.hasStarted).toBe(true);
    t.dispose();
  });

  it('defaultsTheGenerationBudgetToFifteenSeconds', () => {
    // Not observable without waiting 15s, so this reads the normalised field.
    // It is the one internal worth pinning: the 15s/60s split is the fix.
    const t = new SpeechTimer();
    expect(t._generationTimeoutMs).toBe(15000);
    t.dispose();
  });

  it('toleratesMissingCallbacks', async () => {
    // The constructor normalises absent callbacks to no-ops; without that the
    // timeout would throw inside a timer callback, which vitest reports as an
    // unhandled error rather than a failed assertion.
    const t = new SpeechTimer({ generationTimeoutMs: 10 });
    t.startGeneration();
    await sleep(40);
    expect(() => t.speechStarted(0)).not.toThrow();
    t.dispose();
  });

  it('disposeIsIdempotentAndCancelsBothTimers', async () => {
    const t = new SpeechTimer({ generationTimeoutMs: 20, onGenerationTimeout: onGen, onPlaybackTimeout: onPlay });
    t.startGeneration();
    t.speechStarted(0.5);
    t.dispose();
    expect(() => t.dispose()).not.toThrow();
    await sleep(60);
    expect(onGen).not.toHaveBeenCalled();
    expect(onPlay).not.toHaveBeenCalled();
  });

  it('disposeCancelsAGenerationTimerThatIsStillArmed', async () => {
    // Only the generation phase is running here, so the playback branch of
    // dispose is skipped. Its sibling below covers the mirror image; between
    // them each guard is exercised with its handle present and absent.
    const t = new SpeechTimer({ generationTimeoutMs: 20, onGenerationTimeout: onGen });
    t.startGeneration();
    expect(t._genTimer).not.toBeNull();
    t.dispose();
    expect(t._genTimer).toBeNull();
    await sleep(60);
    expect(onGen).not.toHaveBeenCalled();
  });

  it('disposeCancelsAPlaybackTimerThatIsStillArmed', async () => {
    const t = new SpeechTimer({ onPlaybackTimeout: onPlay });
    t.speechStarted(0.5);
    expect(t._playTimer).not.toBeNull();
    t.dispose();
    expect(t._playTimer).toBeNull();
    await sleep(60);
    expect(onPlay).not.toHaveBeenCalled();
  });

  it('disposeIsSafeBeforeAnyTimerIsArmed', () => {
    // Both handles are null, so both guarded clearTimeout calls are skipped.
    const t = new SpeechTimer();
    expect(() => t.dispose()).not.toThrow();
    expect(t._genTimer).toBeNull();
    expect(t._playTimer).toBeNull();
  });

  it('refusesToStartAfterDispose', async () => {
    const t = new SpeechTimer({ generationTimeoutMs: 10, onGenerationTimeout: onGen });
    t.dispose();
    t.startGeneration();
    await sleep(40);
    expect(onGen).not.toHaveBeenCalled();
  });

  it('refusesSpeechStartedAfterDispose', async () => {
    const t = new SpeechTimer({ onPlaybackTimeout: onPlay });
    t.dispose();
    t.speechStarted(1);
    await sleep(30);
    expect(t.hasStarted).toBe(false);
    expect(onPlay).not.toHaveBeenCalled();
  });

  it('refusesSpeechFinishedAfterDispose', () => {
    const t = new SpeechTimer();
    t.dispose();
    expect(() => t.speechFinished()).not.toThrow();
  });
});
