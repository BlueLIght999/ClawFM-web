import { describe, expect, it } from 'vitest';
import { restartDecision, restartDelayMs } from '../interface/process/restartPolicy.js';

describe('restartDecision', () => {
  it('restartDecision_whenStartupFails_returnsFail', () => {
    expect(restartDecision({ wasReady: false, exitCode: 1, restartCount: 0, maxRestarts: 10 }))
      .toBe('fail');
  });

  it('restartDecision_whenReadyProcessCrashes_returnsRestart', () => {
    expect(restartDecision({ wasReady: true, exitCode: 1, restartCount: 0, maxRestarts: 10 }))
      .toBe('restart');
  });

  it('restartDecision_whenShutdownRequested_returnsStop', () => {
    expect(restartDecision({
      wasReady: true,
      shuttingDown: true,
      exitCode: 1,
      restartCount: 0,
      maxRestarts: 10,
    })).toBe('stop');
  });

  it('restartDecision_whenRetryLimitReached_returnsFail', () => {
    expect(restartDecision({ wasReady: true, exitCode: 1, restartCount: 10, maxRestarts: 10 }))
      .toBe('fail');
  });

  it('restartDelayMs_usesCappedExponentialBackoff', () => {
    expect(restartDelayMs(1)).toBe(1000);
    expect(restartDelayMs(6)).toBe(30000);
  });
});
