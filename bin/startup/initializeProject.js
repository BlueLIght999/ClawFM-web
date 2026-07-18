import { shouldBuildClient } from './buildRules.js';

export async function initializeProject({ root, forceBuild = false, deps }) {
  const report = await deps.inspectProject(root);
  if (report.status === 'fail') {
    throw new Error(`Startup preflight failed: ${report.failures.join('; ')}`);
  }

  await deps.ensureRuntimeDirectories(root);
  const buildState = await deps.inspectClientBuild(root);
  const needsBuild = shouldBuildClient({ ...buildState, forceBuild });
  if (!needsBuild) return { report, built: false };

  await deps.buildClient(root);
  await deps.writeBuildState(root, buildState.currentFingerprint);
  return { report, built: true };
}
