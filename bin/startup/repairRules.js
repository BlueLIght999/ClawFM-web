const WORKSPACES = [
  { name: 'root', dir: '.' },
  { name: 'server', dir: 'server' },
  { name: 'client', dir: 'client' },
];

function uniqueSorted(values) {
  return [...new Set(values || [])].sort();
}

/**
 * Builds the deterministic dependency repair plan from preflight facts.
 * @param {{missingDependencies: Record<string, string[]>, blockers: string[]}} input Missing packages and non-repairable failures.
 * @returns {{canRepair: boolean, needed: boolean, blockers: string[], workspaces: Array<{name: string, dir: string, dependencies: string[]}>}} Ordered repair plan.
 * @throws Does not throw; malformed or unknown workspace input becomes a blocker.
 * Constraint: only the root, server, and client lockfile workspaces may be repaired.
 */
export function createDependencyRepairPlan({ missingDependencies = {}, blockers = [] }) {
  const knownNames = new Set(WORKSPACES.map(workspace => workspace.name));
  const unknownWorkspaceBlockers = Object.entries(missingDependencies)
    .filter(([name, dependencies]) => !knownNames.has(name) && dependencies?.length > 0)
    .map(([name]) => `Unknown dependency workspace: ${name}`);
  const normalizedBlockers = uniqueSorted([...blockers, ...unknownWorkspaceBlockers]);
  const workspaces = WORKSPACES.flatMap(workspace => {
    const dependencies = uniqueSorted(missingDependencies[workspace.name]);
    return dependencies.length > 0 ? [{ ...workspace, dependencies }] : [];
  });

  return {
    canRepair: normalizedBlockers.length === 0,
    needed: workspaces.length > 0,
    blockers: normalizedBlockers,
    workspaces,
  };
}
