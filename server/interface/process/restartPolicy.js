export function restartDecision({
  wasReady,
  shuttingDown = false,
  exitCode,
  restartCount,
  maxRestarts,
}) {
  if (shuttingDown || exitCode === 0 || exitCode === null) return 'stop';
  if (!wasReady || restartCount >= maxRestarts) return 'fail';
  return 'restart';
}

export function restartDelayMs(attempt, { baseDelayMs = 1000, maxDelayMs = 30000 } = {}) {
  return Math.min(baseDelayMs * (2 ** Math.max(0, attempt - 1)), maxDelayMs);
}
