/**
 * saveDebouncer — debounces synchronous database save calls.
 *
 * Problem: sql.js `execute()` called `saveDb()` on every write, blocking the
 * event loop with a full disk flush. Rapid writes (e.g. history recording,
 * queue persistence) caused noticeable latency spikes.
 *
 * Solution: schedule saves with a short delay so multiple rapid writes
 * coalesce into a single disk flush. Use `flush()` for immediate persistence
 * (e.g. before shutdown).
 */

const DEFAULT_DELAY_MS = 100;

export function createSaveDebouncer(saveFn, delayMs = DEFAULT_DELAY_MS) {
  let timer = null;
  let pending = false;

  function schedule() {
    pending = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      pending = false;
      saveFn();
    }, delayMs);
  }

  function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending) {
      pending = false;
      saveFn();
    }
  }

  function cancel() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    pending = false;
  }

  return {
    schedule,
    flush,
    cancel,
    get hasPending() { return pending; },
  };
}
