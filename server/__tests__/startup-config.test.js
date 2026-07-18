import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadStartupConfig, startupPortsValid } from '../../bin/startup/startupConfig.js';

const tempDirs = [];

function createRoot(envText) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qclaudio-config-'));
  tempDirs.push(root);
  fs.writeFileSync(path.join(root, '.env'), envText);
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('loadStartupConfig', () => {
  it('loadStartupConfig_readsPortsFromEnvFile', () => {
    const root = createRoot('PORT=4444\nNETEASE_API_PORT=4555\n');

    expect(loadStartupConfig(root, {})).toEqual({ port: 4444, neteasePort: 4555 });
  });

  it('loadStartupConfig_processEnvironmentOverridesFile', () => {
    const root = createRoot('PORT=4444\nNETEASE_API_PORT=4555\n');

    expect(loadStartupConfig(root, { PORT: '5555' })).toEqual({ port: 5555, neteasePort: 4555 });
  });

  it('startupPortsValid_rejectsInvalidOrDuplicatePorts', () => {
    expect(startupPortsValid({ port: Number.NaN, neteasePort: 4001 })).toBe(false);
    expect(startupPortsValid({ port: 3333, neteasePort: 3333 })).toBe(false);
    expect(startupPortsValid({ port: 3333, neteasePort: 4001 })).toBe(true);
  });
});
