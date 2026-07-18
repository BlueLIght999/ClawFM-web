import { describe, expect, it, vi } from 'vitest';
import { initializeProject } from '../../bin/startup/initializeProject.js';

function createDeps(overrides = {}) {
  return {
    inspectProject: vi.fn().mockResolvedValue({ status: 'pass', failures: [], warnings: [], checks: [] }),
    ensureRuntimeDirectories: vi.fn().mockResolvedValue(undefined),
    inspectClientBuild: vi.fn().mockResolvedValue({
      distExists: true,
      currentFingerprint: 'same',
      previousFingerprint: 'same',
    }),
    buildClient: vi.fn().mockResolvedValue(undefined),
    writeBuildState: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('initializeProject', () => {
  it('initializeProject_whenPreflightFails_stopsBeforeMutation', async () => {
    const deps = createDeps({
      inspectProject: vi.fn().mockResolvedValue({
        status: 'fail',
        failures: ['server: express'],
        warnings: [],
        checks: [],
      }),
    });

    await expect(initializeProject({ root: 'F:/app', deps })).rejects.toThrow('server: express');
    expect(deps.ensureRuntimeDirectories).not.toHaveBeenCalled();
    expect(deps.buildClient).not.toHaveBeenCalled();
  });

  it('initializeProject_whenBuildIsStale_buildsAndPersistsFingerprint', async () => {
    const callOrder = [];
    const deps = createDeps({
      ensureRuntimeDirectories: vi.fn().mockImplementation(async () => { callOrder.push('dirs'); }),
      inspectClientBuild: vi.fn().mockImplementation(async () => {
        callOrder.push('inspect-build');
        return { distExists: true, currentFingerprint: 'new', previousFingerprint: 'old' };
      }),
      buildClient: vi.fn().mockImplementation(async () => { callOrder.push('build'); }),
      writeBuildState: vi.fn().mockImplementation(async () => { callOrder.push('state'); }),
    });

    const result = await initializeProject({ root: 'F:/app', deps });

    expect(result.built).toBe(true);
    expect(callOrder).toEqual(['dirs', 'inspect-build', 'build', 'state']);
    expect(deps.writeBuildState).toHaveBeenCalledWith('F:/app', 'new');
  });

  it('initializeProject_whenBuildIsCurrent_skipsBuild', async () => {
    const deps = createDeps();

    const result = await initializeProject({ root: 'F:/app', deps });

    expect(result.built).toBe(false);
    expect(deps.buildClient).not.toHaveBeenCalled();
    expect(deps.writeBuildState).not.toHaveBeenCalled();
  });
});
