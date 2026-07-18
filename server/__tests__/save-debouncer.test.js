import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSaveDebouncer } from '../domain/db/saveDebouncer.js';

describe('H4: saveDebouncer — debounce synchronous saveDb calls', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('does not call saveFn immediately on schedule()', () => {
    const saveFn = vi.fn();
    const debouncer = createSaveDebouncer(saveFn, 100);

    debouncer.schedule();

    expect(saveFn).not.toHaveBeenCalled();
  });

  test('calls saveFn once after delay when multiple schedule() calls happen rapidly', () => {
    const saveFn = vi.fn();
    const debouncer = createSaveDebouncer(saveFn, 100);

    debouncer.schedule();
    debouncer.schedule();
    debouncer.schedule();
    debouncer.schedule();

    expect(saveFn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);

    expect(saveFn).toHaveBeenCalledTimes(1);
  });

  test('flush() triggers immediate save if pending', () => {
    const saveFn = vi.fn();
    const debouncer = createSaveDebouncer(saveFn, 100);

    debouncer.schedule();
    expect(saveFn).not.toHaveBeenCalled();

    debouncer.flush();

    expect(saveFn).toHaveBeenCalledTimes(1);
    // Advancing timers should not trigger a second call
    vi.advanceTimersByTime(200);
    expect(saveFn).toHaveBeenCalledTimes(1);
  });

  test('flush() is a no-op when nothing is pending', () => {
    const saveFn = vi.fn();
    const debouncer = createSaveDebouncer(saveFn, 100);

    debouncer.flush();

    expect(saveFn).not.toHaveBeenCalled();
  });

  test('cancel() prevents pending save from firing', () => {
    const saveFn = vi.fn();
    const debouncer = createSaveDebouncer(saveFn, 100);

    debouncer.schedule();
    debouncer.cancel();

    vi.advanceTimersByTime(500);

    expect(saveFn).not.toHaveBeenCalled();
  });

  test('hasPending reflects scheduling state', () => {
    const saveFn = vi.fn();
    const debouncer = createSaveDebouncer(saveFn, 100);

    expect(debouncer.hasPending).toBe(false);

    debouncer.schedule();
    expect(debouncer.hasPending).toBe(true);

    vi.advanceTimersByTime(100);
    expect(debouncer.hasPending).toBe(false);
  });
});
