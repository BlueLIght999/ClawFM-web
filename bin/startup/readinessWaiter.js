import { probeInstance } from './instanceProbe.js';

async function defaultWaitOn(options) {
  const { default: waitOn } = await import('wait-on');
  return waitOn(options);
}

function waitForEarlyExit(processHandle) {
  if (!processHandle) return new Promise(() => {});

  return new Promise((_, reject) => {
    processHandle.once('error', reject);
    processHandle.once('exit', (code) => {
      reject(new Error(`Server process exited before readiness (code ${code})`));
    });
  });
}

export async function waitForQclaudioReady({
  baseUrl,
  processHandle = null,
  timeoutMs = 30000,
  waitOnImpl = defaultWaitOn,
  probe = probeInstance,
}) {
  const readinessUrl = new URL('/health/ready', baseUrl).toString();
  const resource = readinessUrl.replace(/^http:/, 'http-get:').replace(/^https:/, 'https-get:');

  await Promise.race([
    waitOnImpl({ resources: [resource], timeout: timeoutMs, interval: 250, simultaneous: 1 }),
    waitForEarlyExit(processHandle),
  ]);

  const result = await probe({ baseUrl });
  if (result.status !== 'qclaudio') {
    throw new Error('Readiness endpoint responded without Qclaudio identity');
  }
  return result.readiness;
}
