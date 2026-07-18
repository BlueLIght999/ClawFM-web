import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  computeClientFingerprint,
  inspectClientBuild,
  resolveNpmCliPath,
  writeBuildState,
} from '../../bin/startup/clientBuild.js';

const tempDirs = [];

function createClientFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qclaudio-build-'));
  tempDirs.push(root);
  fs.mkdirSync(path.join(root, 'client', 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'client', 'public'), { recursive: true });
  fs.mkdirSync(path.join(root, 'client', 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'client', 'index.html'), '<div id="root"></div>');
  fs.writeFileSync(path.join(root, 'client', 'package.json'), '{}');
  fs.writeFileSync(path.join(root, 'client', 'package-lock.json'), '{}');
  fs.writeFileSync(path.join(root, 'client', 'src', 'main.js'), 'export const value = 1;');
  fs.writeFileSync(path.join(root, 'client', 'public', 'sw.js'), 'const CACHE = 1;');
  fs.writeFileSync(path.join(root, 'client', 'dist', 'index.html'), 'built');
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('client build fingerprint', () => {
  it('resolveNpmCliPath_prefersCurrentNpmExecutionPath', () => {
    const npmCli = 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js';

    expect(resolveNpmCliPath({
      environment: { npm_execpath: npmCli },
      nodeExecutable: 'C:\\Program Files\\nodejs\\node.exe',
      existsSync: candidate => candidate === npmCli,
    })).toBe(npmCli);
  });

  it('computeClientFingerprint_whenContentChanges_returnsDifferentHash', () => {
    const root = createClientFixture();
    const first = computeClientFingerprint(root);

    fs.writeFileSync(path.join(root, 'client', 'src', 'main.js'), 'export const value = 2;');
    const second = computeClientFingerprint(root);

    expect(second).not.toBe(first);
  });

  it('writeBuildState_thenInspectClientBuild_returnsMatchingFingerprint', async () => {
    const root = createClientFixture();
    const fingerprint = computeClientFingerprint(root);

    await writeBuildState(root, fingerprint);
    const state = await inspectClientBuild(root);

    expect(state.distExists).toBe(true);
    expect(state.currentFingerprint).toBe(fingerprint);
    expect(state.previousFingerprint).toBe(fingerprint);
  });

  it('inspectClientBuild_whenStateIsCorrupt_treatsPreviousFingerprintAsMissing', async () => {
    const root = createClientFixture();
    const runtimeDir = path.join(root, 'data', 'runtime');
    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.writeFileSync(path.join(runtimeDir, 'startup-state.json'), '{bad json');

    const state = await inspectClientBuild(root);

    expect(state.previousFingerprint).toBeNull();
  });
});
