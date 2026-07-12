import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * SpeechTimer — manages split timeouts for DJ speech lifecycle.
 *
 * Two phases:
 *   1. GENERATION — LLM + TTS generation (max 15s). If exceeded, skip speech.
 *   2. PLAYBACK   — client audio playback (max speechDuration + 5s buffer).
 *                    Cancelled when client emits 'dj-speech-finished'.
 *
 * This prevents the original bug: a single 30s timeout fired mid-playback
 * because it started counting from song-end, not from speech-start.
 */

// ── RED: Tests written BEFORE implementation ──────────────────────

// We'll import the class once created — for now, define the expected API

describe('SpeechTimer', () => {
  let SpeechTimer;
  let timer;

  beforeEach(async () => {
    // Dynamic import — will resolve after implementation exists
    try {
      const mod = await import('../domain/playback/speechTimer.js');
      SpeechTimer = mod.SpeechTimer;
    } catch { /* not yet implemented — tests will fail on constructor */ }
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (timer) timer.dispose();
    vi.useRealTimers();
  });

  // ──── Test 1: Generation timeout fires if speech never starts ────

  it('fires onGenerationTimeout if speech does not start within generation limit', () => {
    const onGenTimeout = vi.fn();
    const onPlaybackTimeout = vi.fn();

    timer = new SpeechTimer({
      generationTimeoutMs: 15000,
      onGenerationTimeout: onGenTimeout,
      onPlaybackTimeout: onPlaybackTimeout,
    });

    timer.startGeneration();

    // Before timeout, nothing fires
    vi.advanceTimersByTime(14000);
    expect(onGenTimeout).not.toHaveBeenCalled();
    expect(onPlaybackTimeout).not.toHaveBeenCalled();

    // At timeout, generation callback fires
    vi.advanceTimersByTime(1000);
    expect(onGenTimeout).toHaveBeenCalledTimes(1);
    expect(onPlaybackTimeout).not.toHaveBeenCalled();
  });

  // ──── Test 2: speechStarted cancels generation timeout ────

  it('cancels generation timeout when speech starts playing', () => {
    const onGenTimeout = vi.fn();

    timer = new SpeechTimer({
      generationTimeoutMs: 15000,
      onGenerationTimeout: onGenTimeout,
    });

    timer.startGeneration();

    // Speech starts after 8s (TTS generation completed)
    vi.advanceTimersByTime(8000);
    timer.speechStarted(10); // 10-second speech duration

    // Generation timeout should be cancelled — advance past it
    vi.advanceTimersByTime(8000); // 8 + 8 = 16s total, past 15s limit
    expect(onGenTimeout).not.toHaveBeenCalled();
  });

  // ──── Test 3: Playback timeout fires if speech never finishes ────

  it('fires onPlaybackTimeout if speech does not finish within playback window', () => {
    const onPlaybackTimeout = vi.fn();
    const onGenTimeout = vi.fn();

    timer = new SpeechTimer({
      generationTimeoutMs: 15000,
      onGenerationTimeout: onGenTimeout,
      onPlaybackTimeout: onPlaybackTimeout,
    });

    timer.startGeneration();
    vi.advanceTimersByTime(3000);
    timer.speechStarted(6); // 6s speech, timeout at 6+5=11s from now

    // Advance to just before playback timeout (3s elapsed + 10s = 13s, timeout at 3+11=14s)
    vi.advanceTimersByTime(10000); // total 13s
    expect(onPlaybackTimeout).not.toHaveBeenCalled();

    // Cross the threshold
    vi.advanceTimersByTime(1000); // total 14s
    expect(onPlaybackTimeout).toHaveBeenCalledTimes(1);
    expect(onGenTimeout).not.toHaveBeenCalled();
  });

  // ──── Test 4: speechFinished cancels playback timeout ────

  it('cancels playback timeout when speech finishes normally', () => {
    const onPlaybackTimeout = vi.fn();

    timer = new SpeechTimer({
      generationTimeoutMs: 15000,
      onPlaybackTimeout: onPlaybackTimeout,
    });

    timer.startGeneration();
    timer.speechStarted(8);
    vi.advanceTimersByTime(8000); // speech played for 8s
    timer.speechFinished();

    // Advance past where playback timeout would have fired
    vi.advanceTimersByTime(10000);
    expect(onPlaybackTimeout).not.toHaveBeenCalled();
  });

  // ──── Test 5: dispose cleans up all timers ────

  it('cancels all timers on dispose', () => {
    const onGenTimeout = vi.fn();
    const onPlaybackTimeout = vi.fn();

    timer = new SpeechTimer({
      generationTimeoutMs: 15000,
      onGenerationTimeout: onGenTimeout,
      onPlaybackTimeout: onPlaybackTimeout,
    });

    timer.startGeneration();
    timer.speechStarted(10);
    timer.dispose();

    vi.advanceTimersByTime(30000);
    expect(onGenTimeout).not.toHaveBeenCalled();
    expect(onPlaybackTimeout).not.toHaveBeenCalled();
  });

  // ──── Test 6: speechStarted after generation timeout is a no-op ────

  it('ignores speechStarted if generation already timed out', () => {
    const onGenTimeout = vi.fn();
    const onPlaybackTimeout = vi.fn();

    timer = new SpeechTimer({
      generationTimeoutMs: 10000,
      onGenerationTimeout: onGenTimeout,
      onPlaybackTimeout: onPlaybackTimeout,
    });

    timer.startGeneration();
    vi.advanceTimersByTime(10000);
    expect(onGenTimeout).toHaveBeenCalledTimes(1);

    // Late speechStarted should be ignored
    timer.speechStarted(5);
    vi.advanceTimersByTime(15000);
    expect(onPlaybackTimeout).not.toHaveBeenCalled();
  });

  // ──── Test 7: Minimum playback timeout floor ────

  it('enforces a minimum playback timeout of 5 seconds', () => {
    const onPlaybackTimeout = vi.fn();

    timer = new SpeechTimer({
      generationTimeoutMs: 15000,
      onPlaybackTimeout: onPlaybackTimeout,
    });

    timer.startGeneration();
    timer.speechStarted(0.1); // durMs = max(0.1,0.5)*1000 = 500, timeout = max(500+5000, 5000) = 5500ms

    vi.advanceTimersByTime(5400); // just under 5.5s threshold
    expect(onPlaybackTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200); // 5.6s — crosses threshold
    expect(onPlaybackTimeout).toHaveBeenCalledTimes(1);
  });
});
