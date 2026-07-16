import { describe, it, expect } from 'vitest';

/**
 * TDD RED: Test that startServer() calls httpServer.listen BEFORE
 * checkTtsHealth() resolves. This proves TTS health check does not
 * block HTTP listening.
 *
 * The current server.js awaits checkTtsHealth() before httpServer.listen(),
 * causing unnecessary startup delay. The fix moves checkTtsHealth() to
 * run asynchronously after listen().
 */

function createDeferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('startup sequence', () => {
  it('calls httpServer.listen before checkTtsHealth resolves', async () => {
    const { startServer } = await import('../startup.js');

    const callOrder = [];
    const ttsDeferred = createDeferred();

    const deps = {
      startNeteaseApi: () => { callOrder.push('startNeteaseApi'); },
      waitForNeteaseApi: () => {
        callOrder.push('waitForNeteaseApi');
        return Promise.resolve(true);
      },
      initDb: () => { callOrder.push('initDb'); return Promise.resolve(); },
      initProfileDb: () => { callOrder.push('initProfileDb'); },
      setupSocketHandler: () => { callOrder.push('setupSocketHandler'); },
      scheduleProfilePipeline: () => { callOrder.push('scheduleProfilePipeline'); },
      httpServer: {
        listen: (_port, cb) => {
          callOrder.push('httpServer.listen');
          if (cb) cb();
        },
      },
      checkTtsHealth: () => {
        callOrder.push('checkTtsHealth');
        return ttsDeferred.promise;
      },
      displayTtsHealthBanner: () => { callOrder.push('displayTtsHealthBanner'); },
      restoreNeteaseSession: () => {
        callOrder.push('restoreNeteaseSession');
        return Promise.resolve();
      },
      config: { port: 3333, netease: { apiPort: 4001 } },
      services: {},
      io: {},
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    };

    // Start server — don't await because checkTtsHealth hasn't resolved
    startServer(deps);

    // Let microtasks settle so all synchronous + resolved promises run
    await new Promise(r => setTimeout(r, 50));

    // httpServer.listen should have been called
    expect(callOrder).toContain('httpServer.listen');

    // checkTtsHealth was called (initiated) but displayTtsHealthBanner
    // was NOT called yet — proving listen didn't wait for TTS check
    expect(callOrder).toContain('checkTtsHealth');
    expect(callOrder).not.toContain('displayTtsHealthBanner');

    // Now resolve checkTtsHealth
    ttsDeferred.resolve({ available: true, provider: 'dashscope' });

    // Wait for .then() callback to execute
    await new Promise(r => setTimeout(r, 50));

    // Now displayTtsHealthBanner should have been called
    expect(callOrder).toContain('displayTtsHealthBanner');
  });

  it('still calls checkTtsHealth even if waitForNeteaseApi fails', async () => {
    const { startServer } = await import('../startup.js');

    const callOrder = [];
    const ttsDeferred = createDeferred();

    const deps = {
      startNeteaseApi: () => {},
      waitForNeteaseApi: () => Promise.resolve(false),
      initDb: () => Promise.resolve(),
      initProfileDb: () => {},
      setupSocketHandler: () => {},
      scheduleProfilePipeline: () => {},
      httpServer: { listen: (_p, cb) => { if (cb) cb(); } },
      checkTtsHealth: () => ttsDeferred.promise,
      displayTtsHealthBanner: () => { callOrder.push('banner'); },
      restoreNeteaseSession: () => Promise.resolve(),
      config: { port: 3333, netease: { apiPort: 4001 } },
      services: {},
      io: {},
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    };

    startServer(deps);
    await new Promise(r => setTimeout(r, 50));

    // checkTtsHealth was called despite NeteaseAPI not being ready
    expect(callOrder).not.toContain('banner');

    ttsDeferred.resolve({ available: false });
    await new Promise(r => setTimeout(r, 50));

    expect(callOrder).toContain('banner');
  });
});
