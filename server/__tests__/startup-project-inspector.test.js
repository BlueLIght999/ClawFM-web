import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { inspectProject } from '../../bin/startup/projectInspector.js';

const tempDirs = [];

function createProject({ serverDependencies = {}, env = 'PORT=3333\nNETEASE_API_PORT=4001\n' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qclaudio-preflight-'));
  tempDirs.push(root);
  fs.mkdirSync(path.join(root, 'server'), { recursive: true });
  fs.mkdirSync(path.join(root, 'client'), { recursive: true });
  fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: {} }));
  fs.writeFileSync(path.join(root, 'package-lock.json'), '{}');
  fs.writeFileSync(path.join(root, 'server', 'package.json'), JSON.stringify({ dependencies: serverDependencies }));
  fs.writeFileSync(path.join(root, 'server', 'package-lock.json'), '{}');
  fs.writeFileSync(path.join(root, 'client', 'package.json'), JSON.stringify({ dependencies: {}, devDependencies: {} }));
  fs.writeFileSync(path.join(root, 'client', 'package-lock.json'), '{}');
  fs.writeFileSync(path.join(root, 'bin', 'qclaudio.js'), '');
  fs.writeFileSync(path.join(root, '.env.example'), 'PORT=3333');
  if (env !== null) fs.writeFileSync(path.join(root, '.env'), env);
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('inspectProject', () => {
  it('inspectProject_whenFixtureIsComplete_returnsPass', async () => {
    const root = createProject();

    const report = await inspectProject(root, {
      nodeVersion: 'v18.20.0',
      npmAvailable: true,
      environment: {},
    });

    expect(report.status).toBe('pass');
  });

  it('inspectProject_whenDependencyCannotResolve_reportsWorkspaceAndName', async () => {
    const root = createProject({ serverDependencies: { express: '^4.0.0' } });

    const report = await inspectProject(root, {
      nodeVersion: 'v18.20.0',
      npmAvailable: true,
      environment: {},
      resolveDependency: () => false,
    });

    expect(report.status).toBe('fail');
    expect(report.failures.join(' ')).toContain('server: express');
  });

  it('inspectProject_whenConfiguredPortsMatch_reportsFailure', async () => {
    const root = createProject({ env: 'PORT=3333\nNETEASE_API_PORT=3333\n' });

    const report = await inspectProject(root, {
      nodeVersion: 'v18.20.0',
      npmAvailable: true,
      environment: {},
    });

    expect(report.status).toBe('fail');
    expect(report.failures.join(' ')).toContain('must be different');
  });
});
