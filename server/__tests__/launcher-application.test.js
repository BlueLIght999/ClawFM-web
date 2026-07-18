import { describe, expect, it, vi } from 'vitest';
import { launchApplication } from '../../bin/startup/launchApplication.js';

function createDependencies(overrides = {}) {
  const processHandle = { pid: 42 };
  return {
    probeInstance: vi.fn().mockResolvedValue({ status: 'absent' }),
    initialize: vi.fn().mockResolvedValue({ built: false }),
    startServer: vi.fn(() => processHandle),
    waitUntilReady: vi.fn().mockResolvedValue({
      status: 'ready',
      service: 'qclaudio',
      instanceId: 'new-instance',
    }),
    openBrowser: vi.fn().mockResolvedValue({ browser: 'edge' }),
    stopServer: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('launchApplication', () => {
  it('launchApplication_whenServerStarts_opensBrowserOnlyAfterReady', async () => {
    const callOrder = [];
    const deps = createDependencies({
      startServer: vi.fn(() => {
        callOrder.push('start');
        return { pid: 42 };
      }),
      initialize: vi.fn().mockImplementation(async () => { callOrder.push('initialize'); }),
      waitUntilReady: vi.fn().mockImplementation(async () => {
        callOrder.push('ready');
        return { status: 'ready', service: 'qclaudio', instanceId: 'new-instance' };
      }),
      openBrowser: vi.fn().mockImplementation(async () => {
        callOrder.push('browser');
        return { browser: 'edge' };
      }),
    });

    const result = await launchApplication({ url: 'http://localhost:3333', deps });

    expect(callOrder).toEqual(['initialize', 'start', 'ready', 'browser']);
    expect(result.mode).toBe('started');
  });

  it('launchApplication_whenQclaudioAlreadyRuns_reusesInstance', async () => {
    const deps = createDependencies({
      probeInstance: vi.fn().mockResolvedValue({
        status: 'qclaudio',
        readiness: { status: 'ready', service: 'qclaudio', instanceId: 'existing' },
      }),
    });

    const result = await launchApplication({ url: 'http://localhost:3333', deps });

    expect(result.mode).toBe('reused');
    expect(deps.initialize).not.toHaveBeenCalled();
    expect(deps.startServer).not.toHaveBeenCalled();
    expect(deps.openBrowser).toHaveBeenCalledOnce();
  });

  it('launchApplication_whenForeignServiceOwnsPort_failsWithoutSpawning', async () => {
    const deps = createDependencies({
      probeInstance: vi.fn().mockResolvedValue({ status: 'foreign', statusCode: 404 }),
    });

    await expect(launchApplication({ url: 'http://localhost:3333', deps }))
      .rejects.toThrow('3333');
    expect(deps.startServer).not.toHaveBeenCalled();
    expect(deps.openBrowser).not.toHaveBeenCalled();
  });

  it('launchApplication_whenReadinessTimesOut_stopsOwnedServer', async () => {
    const processHandle = { pid: 42 };
    const deps = createDependencies({
      startServer: vi.fn(() => processHandle),
      waitUntilReady: vi.fn().mockRejectedValue(new Error('readiness timeout')),
    });

    await expect(launchApplication({ url: 'http://localhost:3333', deps }))
      .rejects.toThrow('readiness timeout');
    expect(deps.stopServer).toHaveBeenCalledWith(processHandle);
    expect(deps.openBrowser).not.toHaveBeenCalled();
  });

  it('launchApplication_whenNoOpenRequested_doesNotOpenBrowser', async () => {
    const deps = createDependencies();

    await launchApplication({ url: 'http://localhost:3333', noOpen: true, deps });

    expect(deps.openBrowser).not.toHaveBeenCalled();
  });
});
