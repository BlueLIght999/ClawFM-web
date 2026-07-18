import { describe, expect, it, vi } from 'vitest';
import {
  installWorkspaceDependencies,
  repairProjectDependencies,
} from '../../bin/startup/dependencyRepair.js';

function report({ status = 'fail', repairPlan } = {}) {
  return {
    status,
    failures: status === 'fail' ? ['server: express'] : [],
    warnings: [],
    checks: [],
    repairPlan: repairPlan || {
      canRepair: true,
      needed: true,
      blockers: [],
      workspaces: [{ name: 'server', dir: 'server', dependencies: ['express'] }],
    },
  };
}

describe('repairProjectDependencies', () => {
  it('repairProjectDependencies_whenDependenciesAreMissing_installsThenReinspects', async () => {
    const before = report({
      repairPlan: {
        canRepair: true,
        needed: true,
        blockers: [],
        workspaces: [
          { name: 'root', dir: '.', dependencies: ['wait-on'] },
          { name: 'server', dir: 'server', dependencies: ['express'] },
        ],
      },
    });
    const after = report({
      status: 'pass',
      repairPlan: { canRepair: true, needed: false, blockers: [], workspaces: [] },
    });
    const calls = [];
    const deps = {
      inspectProject: vi.fn()
        .mockImplementationOnce(async () => { calls.push('inspect-before'); return before; })
        .mockImplementationOnce(async () => { calls.push('inspect-after'); return after; }),
      installWorkspace: vi.fn().mockImplementation(async (_root, workspace) => {
        calls.push(`install-${workspace.name}`);
      }),
    };

    const result = await repairProjectDependencies({ root: 'F:/app', deps });

    expect(calls).toEqual(['inspect-before', 'install-root', 'install-server', 'inspect-after']);
    expect(result.repairedWorkspaces).toEqual(['root', 'server']);
    expect(result.report).toBe(after);
  });

  it('repairProjectDependencies_whenNothingIsMissing_doesNotInstall', async () => {
    const current = report({
      status: 'pass',
      repairPlan: { canRepair: true, needed: false, blockers: [], workspaces: [] },
    });
    const deps = {
      inspectProject: vi.fn().mockResolvedValue(current),
      installWorkspace: vi.fn(),
    };

    const result = await repairProjectDependencies({ root: 'F:/app', deps });

    expect(result.repairedWorkspaces).toEqual([]);
    expect(deps.inspectProject).toHaveBeenCalledTimes(1);
    expect(deps.installWorkspace).not.toHaveBeenCalled();
  });

  it('repairProjectDependencies_whenOtherPreflightChecksFail_rejectsBeforeMutation', async () => {
    const blocked = report({
      repairPlan: {
        canRepair: false,
        needed: true,
        blockers: ['PORT and NETEASE_API_PORT must be different'],
        workspaces: [{ name: 'server', dir: 'server', dependencies: ['express'] }],
      },
    });
    const deps = {
      inspectProject: vi.fn().mockResolvedValue(blocked),
      installWorkspace: vi.fn(),
    };

    await expect(repairProjectDependencies({ root: 'F:/app', deps }))
      .rejects.toThrow('PORT and NETEASE_API_PORT must be different');
    expect(deps.installWorkspace).not.toHaveBeenCalled();
  });

  it('repairProjectDependencies_whenVerificationStillFails_reportsRemainingFailure', async () => {
    const deps = {
      inspectProject: vi.fn()
        .mockResolvedValueOnce(report())
        .mockResolvedValueOnce(report()),
      installWorkspace: vi.fn().mockResolvedValue(undefined),
    };

    await expect(repairProjectDependencies({ root: 'F:/app', deps }))
      .rejects.toThrow('Repair verification failed: server: express');
  });
});

describe('installWorkspaceDependencies', () => {
  it('installWorkspaceDependencies_usesNpmCiThroughCurrentNodeWithoutShell', async () => {
    const execFileSync = vi.fn();

    await installWorkspaceDependencies(
      'F:/app',
      { name: 'server', dir: 'server', dependencies: ['express'] },
      {
        execFileSync,
        nodeExecutable: 'C:/node/node.exe',
        resolveNpmCli: () => 'C:/node/npm-cli.js',
      },
    );

    expect(execFileSync).toHaveBeenCalledWith(
      'C:/node/node.exe',
      ['C:/node/npm-cli.js', 'ci', '--no-audit', '--no-fund'],
      {
        cwd: expect.stringMatching(/[\\/]app[\\/]server$/),
        stdio: 'inherit',
        shell: false,
      },
    );
  });

  it('installWorkspaceDependencies_whenNpmFails_wrapsWorkspaceContext', async () => {
    const execFileSync = vi.fn(() => { throw new Error('registry unavailable'); });

    await expect(installWorkspaceDependencies(
      'F:/app',
      { name: 'client', dir: 'client', dependencies: ['vite'] },
      {
        execFileSync,
        nodeExecutable: 'C:/node/node.exe',
        resolveNpmCli: () => 'C:/node/npm-cli.js',
      },
    )).rejects.toThrow('Dependency repair failed for client: registry unavailable');
  });
});
