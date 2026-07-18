import { createDependencyRepairPlan } from './repairRules.js';

const MIN_NODE_MAJOR = 18;

function nodeMajor(version) {
  const match = String(version || '').match(/v?(\d+)/);
  return match ? Number.parseInt(match[1], 10) : 0;
}

function validPort(port) {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

function dependencyFailures(missingDependencies) {
  return Object.entries(missingDependencies)
    .filter(([, names]) => names.length > 0)
    .map(([workspace, names]) => `${workspace}: ${names.join(', ')}`);
}

function fileFailures(missingFiles) {
  return missingFiles.length > 0 ? [`Missing required files: ${missingFiles.join(', ')}`] : [];
}

function portFailures(port, neteasePort) {
  const failures = [];
  if (!validPort(port)) failures.push('PORT must be an integer between 1 and 65535');
  if (!validPort(neteasePort)) failures.push('NETEASE_API_PORT must be an integer between 1 and 65535');
  if (validPort(port) && port === neteasePort) failures.push('PORT and NETEASE_API_PORT must be different');
  return failures;
}

export function evaluatePreflight({
  nodeVersion,
  npmAvailable,
  missingFiles,
  missingDependencies,
  envPresent,
  port,
  neteasePort,
}) {
  const runtimeFailures = [
    ...(nodeMajor(nodeVersion) < MIN_NODE_MAJOR ? [`Node.js ${MIN_NODE_MAJOR}+ is required`] : []),
    ...(!npmAvailable ? ['npm is required to build the client'] : []),
  ];
  const requiredFileFailures = fileFailures(missingFiles);
  const missingDependencyFailures = dependencyFailures(missingDependencies);
  const startupPortFailures = portFailures(port, neteasePort);
  const repairBlockers = [...runtimeFailures, ...requiredFileFailures, ...startupPortFailures];
  const failures = [...repairBlockers, ...missingDependencyFailures];
  const warnings = envPresent ? [] : ['.env is missing; optional AI and TTS features will use fallbacks'];
  const status = failures.length > 0 ? 'fail' : warnings.length > 0 ? 'warn' : 'pass';

  return {
    status,
    failures,
    warnings,
    repairPlan: createDependencyRepairPlan({
      missingDependencies,
      blockers: repairBlockers,
    }),
    checks: [
      { id: 'runtime', status: nodeMajor(nodeVersion) >= MIN_NODE_MAJOR && npmAvailable ? 'pass' : 'fail' },
      { id: 'files', status: missingFiles.length === 0 ? 'pass' : 'fail' },
      { id: 'dependencies', status: dependencyFailures(missingDependencies).length === 0 ? 'pass' : 'fail' },
      { id: 'environment', status: envPresent ? 'pass' : 'warn' },
      { id: 'ports', status: portFailures(port, neteasePort).length === 0 ? 'pass' : 'fail' },
    ],
  };
}
