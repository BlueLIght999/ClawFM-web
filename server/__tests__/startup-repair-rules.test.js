import { describe, expect, it } from 'vitest';
import { createDependencyRepairPlan } from '../../bin/startup/repairRules.js';

describe('createDependencyRepairPlan', () => {
  it('createDependencyRepairPlan_whenDependenciesAreMissing_returnsOrderedWorkspaces', () => {
    const plan = createDependencyRepairPlan({
      missingDependencies: {
        client: ['vite', 'react'],
        root: [],
        server: ['express'],
      },
      blockers: [],
    });

    expect(plan).toEqual({
      canRepair: true,
      needed: true,
      blockers: [],
      workspaces: [
        { name: 'server', dir: 'server', dependencies: ['express'] },
        { name: 'client', dir: 'client', dependencies: ['react', 'vite'] },
      ],
    });
  });

  it('createDependencyRepairPlan_whenNothingIsMissing_returnsNoOpPlan', () => {
    const plan = createDependencyRepairPlan({
      missingDependencies: { root: [], server: [], client: [] },
      blockers: [],
    });

    expect(plan.canRepair).toBe(true);
    expect(plan.needed).toBe(false);
    expect(plan.workspaces).toEqual([]);
  });

  it('createDependencyRepairPlan_whenPreflightHasOtherFailures_blocksMutation', () => {
    const plan = createDependencyRepairPlan({
      missingDependencies: { server: ['express'] },
      blockers: ['Node.js 18+ is required'],
    });

    expect(plan.canRepair).toBe(false);
    expect(plan.blockers).toEqual(['Node.js 18+ is required']);
  });
});
