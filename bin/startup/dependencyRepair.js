import path from 'path';
import { execFileSync } from 'child_process';
import { resolveNpmCliPath } from './clientBuild.js';

function failureMessage(report) {
  return report.failures?.length > 0
    ? report.failures.join('; ')
    : 'dependencies are still missing after npm ci';
}

/**
 * Restores one workspace exactly from its package lock using the current Node/npm installation.
 * @param {string} root Absolute project root.
 * @param {{name: string, dir: string, dependencies: string[]}} workspace Trusted workspace from the repair plan.
 * @param {{execFileSync?: Function, nodeExecutable?: string, resolveNpmCli?: Function}} options Testable process dependencies.
 * @returns {Promise<void>} Resolves after npm ci exits successfully.
 * @throws Wraps npm lookup or installation failures with the affected workspace name.
 * Constraint: this function is called only by the explicit repair command, never normal startup.
 */
export async function installWorkspaceDependencies(root, workspace, options = {}) {
  const run = options.execFileSync || execFileSync;
  const nodeExecutable = options.nodeExecutable || process.execPath;
  const resolveNpmCli = options.resolveNpmCli || resolveNpmCliPath;

  try {
    const npmCli = resolveNpmCli();
    run(nodeExecutable, [npmCli, 'ci', '--no-audit', '--no-fund'], {
      cwd: path.resolve(root, workspace.dir),
      stdio: 'inherit',
      shell: false,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Dependency repair failed for ${workspace.name}: ${reason}`, { cause: error });
  }
}

/**
 * Repairs only missing dependency workspaces and verifies the result with a second preflight.
 * @param {object} input Repair input.
 * @param {string} input.root Absolute project root.
 * @param {{inspectProject: Function, installWorkspace: Function}} input.deps Injected inspector and installer.
 * @returns {Promise<{repairedWorkspaces: string[], report: object}>} Repaired workspace names and verified report.
 * @throws Rejects before mutation for non-repairable failures, or after mutation when verification fails.
 * Constraint: workspaces run sequentially to keep npm cache and console output deterministic.
 */
export async function repairProjectDependencies({ root, deps }) {
  const initialReport = await deps.inspectProject(root);
  const plan = initialReport.repairPlan;
  if (!plan) throw new Error('Dependency repair plan is unavailable; run npm run doctor');
  if (!plan.canRepair) throw new Error(`Dependency repair blocked: ${plan.blockers.join('; ')}`);
  if (!plan.needed) return { repairedWorkspaces: [], report: initialReport };

  for (const workspace of plan.workspaces) {
    await deps.installWorkspace(root, workspace);
  }

  const verifiedReport = await deps.inspectProject(root);
  if (verifiedReport.status === 'fail' || verifiedReport.repairPlan?.needed) {
    throw new Error(`Repair verification failed: ${failureMessage(verifiedReport)}`);
  }
  return {
    repairedWorkspaces: plan.workspaces.map(workspace => workspace.name),
    report: verifiedReport,
  };
}
