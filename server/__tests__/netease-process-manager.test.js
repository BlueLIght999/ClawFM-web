import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockSpawn, mockChildProcess } = vi.hoisted(() => {
  const mockChild = {
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn(),
    killed: false,
    kill: vi.fn(),
  };
  return {
    mockSpawn: vi.fn(() => mockChild),
    mockChildProcess: mockChild,
  };
});

vi.mock('child_process', () => ({ spawn: mockSpawn }));

vi.mock('../config.js', () => ({
  default: { netease: { apiPort: 4001 } },
}));

const { NeteaseProcessManager } = await import('../infrastructure/netease/NeteaseProcessManager.js');

describe('NeteaseProcessManager', () => {
  let manager;
  let logger;

  beforeEach(() => {
    vi.clearAllMocks();
    mockChildProcess.killed = false;
    logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    manager = new NeteaseProcessManager({ logger });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('spawnsChildProcess_onStart', () => {
    manager.start();
    expect(mockSpawn).toHaveBeenCalledWith(
      process.execPath, ['app.js'],
      expect.objectContaining({ cwd: expect.any(String), shell: false }),
    );
  });

  it('ensureStarted_whenHealthyApiExists_reusesItWithoutSpawning', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { code: 200 } }),
    });

    const result = await manager.ensureStarted();

    expect(result).toEqual({ mode: 'reused' });
    expect(mockSpawn).not.toHaveBeenCalled();
    expect(manager.ownsProcess).toBe(false);
  });

  it('ensureStarted_whenForeignServiceOwnsPort_rejectsWithoutSpawning', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ message: 'another service' }),
    });

    await expect(manager.ensureStarted()).rejects.toThrow('4001');
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('ensureStarted_whenProbeTimesOut_doesNotThrow_andStartsNewProcess', async () => {
    vi.useFakeTimers();
    const hangingFetch = vi.fn((_url, { signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    }));
    manager = new NeteaseProcessManager({ logger, fetchImpl: hangingFetch, probeTimeoutMs: 50 });

    const promise = manager.ensureStarted();
    await vi.advanceTimersByTimeAsync(50);

    const result = await promise;
    expect(result).toEqual({ mode: 'started' });
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('setsPortEnv_onStart', () => {
    manager.start();
    const callArgs = mockSpawn.mock.calls[0][2];
    expect(callArgs.env.PORT).toBe('4001');
  });

  it('pipesStdoutToLogger_onStart', () => {
    manager.start();
    expect(mockChildProcess.stdout.on).toHaveBeenCalledWith('data', expect.any(Function));
  });

  it('pipesStderrToLogger_onStart', () => {
    manager.start();
    expect(mockChildProcess.stderr.on).toHaveBeenCalledWith('data', expect.any(Function));
  });

  it('autoRestartsOnCrash_withExponentialBackoff', () => {
    manager.start();
    // Simulate crash with code 1
    const closeHandler = mockChildProcess.on.mock.calls.find(c => c[0] === 'close')[1];
    vi.useFakeTimers();
    closeHandler(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 1 }),
      'auto-restarting',
    );
    // First restart delay: 3000ms
    vi.advanceTimersByTime(3000);
    expect(mockSpawn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('stopsRestarting_afterMaxRestarts', () => {
    manager.start();
    vi.useFakeTimers();
    const closeHandler = mockChildProcess.on.mock.calls.find(c => c[0] === 'close')[1];
    // Simulate 5 crashes
    for (let i = 0; i < 5; i++) {
      closeHandler(1);
      vi.advanceTimersByTime(30000);
    }
    // 6th crash should NOT restart
    const callCountBefore = mockSpawn.mock.calls.length;
    closeHandler(1);
    vi.advanceTimersByTime(30000);
    expect(mockSpawn.mock.calls.length).toBe(callCountBefore);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ port: 4001 }),
      expect.stringContaining('max restart'),
    );
    vi.useRealTimers();
  });

  it('doesNotRestart_onCleanExit', () => {
    manager.start();
    const closeHandler = mockChildProcess.on.mock.calls.find(c => c[0] === 'close')[1];
    closeHandler(0);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('doesNotRestart_onNullExitCode', () => {
    manager.start();
    const closeHandler = mockChildProcess.on.mock.calls.find(c => c[0] === 'close')[1];
    closeHandler(null);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('killsProcess_onTerminate', () => {
    manager.start();
    manager.terminate();
    expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('doesNotRestart_afterTerminate_whenCloseReportsFailure', () => {
    manager.start();
    const closeHandler = mockChildProcess.on.mock.calls.find(c => c[0] === 'close')[1];
    vi.useFakeTimers();

    manager.terminate();
    closeHandler(1);
    vi.advanceTimersByTime(30000);

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('doesNotCrash_onTerminate_whenNotStarted', () => {
    expect(() => manager.terminate()).not.toThrow();
  });

  it('returnsProcess_forExternalUse', () => {
    manager.start();
    expect(manager.process).toBeDefined();
  });

  it('waitForReady_pollsHealthEndpoint', async () => {
    manager.start();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ code: 200 }),
    });
    global.fetch = fetchMock;
    const result = await manager.waitForReady(1000);
    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4001/login/status',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('waitForReady_returnsFalse_onTimeout', async () => {
    manager.start();
    global.fetch = vi.fn().mockRejectedValue(new Error('connection refused'));
    const result = await manager.waitForReady(200);
    expect(result).toBe(false);
  });

  it('waitForReady_returnsFalse_onNonJsonResponse', async () => {
    manager.start();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ message: 'not netease' }),
    });
    const result = await manager.waitForReady(200);
    expect(result).toBe(false);
  });

  describe('H6: restartCount resets after stable run', () => {
    it('resets restartCount to 0 after STABLE_RUN_MS', () => {
      vi.useFakeTimers();
      manager.start();

      // Simulate a crash to increment restartCount
      const closeHandler = mockChildProcess.on.mock.calls.find(c => c[0] === 'close')[1];
      closeHandler(1);
      vi.advanceTimersByTime(3000); // trigger restart
      expect(manager.restartCount).toBe(1);

      // After stable run period, restartCount should reset
      vi.advanceTimersByTime(60000);
      expect(manager.restartCount).toBe(0);

      vi.useRealTimers();
    });

    it('allows full 5 restarts again after stable run reset', () => {
      vi.useFakeTimers();
      manager.start();

      const closeHandler = mockChildProcess.on.mock.calls.find(c => c[0] === 'close')[1];

      // Crash 3 times
      for (let i = 0; i < 3; i++) {
        closeHandler(1);
        vi.advanceTimersByTime(30000);
      }
      expect(manager.restartCount).toBe(3);

      // Stable run resets counter
      vi.advanceTimersByTime(60000);
      expect(manager.restartCount).toBe(0);

      // Should be able to crash 5 more times before giving up
      for (let i = 0; i < 5; i++) {
        closeHandler(1);
        vi.advanceTimersByTime(30000);
      }
      expect(manager.restartCount).toBe(5);

      // 6th crash should NOT restart
      const callCountBefore = mockSpawn.mock.calls.length;
      closeHandler(1);
      vi.advanceTimersByTime(30000);
      expect(mockSpawn.mock.calls.length).toBe(callCountBefore);

      vi.useRealTimers();
    });

    it('clears stable-run timer on terminate', () => {
      vi.useFakeTimers();
      manager.start();
      manager.terminate();

      // Advancing past STABLE_RUN_MS should not throw or cause issues
      expect(() => vi.advanceTimersByTime(60000)).not.toThrow();

      vi.useRealTimers();
    });
  });
});
