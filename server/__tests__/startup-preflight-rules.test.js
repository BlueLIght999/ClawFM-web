import { describe, expect, it } from 'vitest';
import { evaluatePreflight } from '../../bin/startup/preflightRules.js';

function validInput(overrides = {}) {
  return {
    nodeVersion: 'v18.20.0',
    npmAvailable: true,
    missingFiles: [],
    missingDependencies: {},
    envPresent: true,
    port: 3333,
    neteasePort: 4001,
    ...overrides,
  };
}

describe('evaluatePreflight', () => {
  it('evaluatePreflight_whenProjectIsReady_returnsPass', () => {
    const report = evaluatePreflight(validInput());

    expect(report.status).toBe('pass');
    expect(report.failures).toEqual([]);
  });

  it('evaluatePreflight_whenDependenciesMissing_returnsActionableFailure', () => {
    const report = evaluatePreflight(validInput({
      missingDependencies: { server: ['express'], client: ['vite'] },
    }));

    expect(report.status).toBe('fail');
    expect(report.failures.join(' ')).toContain('server: express');
    expect(report.failures.join(' ')).toContain('client: vite');
    expect(report.repairPlan).toEqual({
      canRepair: true,
      needed: true,
      blockers: [],
      workspaces: [
        { name: 'server', dir: 'server', dependencies: ['express'] },
        { name: 'client', dir: 'client', dependencies: ['vite'] },
      ],
    });
  });

  it('evaluatePreflight_whenEnvMissing_warnsButAllowsDegradedStartup', () => {
    const report = evaluatePreflight(validInput({ envPresent: false }));

    expect(report.status).toBe('warn');
    expect(report.warnings.join(' ')).toContain('.env');
    expect(report.failures).toEqual([]);
  });

  it('evaluatePreflight_whenNodeVersionIsUnsupported_returnsFailure', () => {
    const report = evaluatePreflight(validInput({ nodeVersion: 'v16.20.2' }));

    expect(report.status).toBe('fail');
    expect(report.failures.join(' ')).toContain('Node.js 18');
  });

  it('evaluatePreflight_whenPortsConflict_returnsFailure', () => {
    const report = evaluatePreflight(validInput({ port: 3333, neteasePort: 3333 }));

    expect(report.status).toBe('fail');
    expect(report.failures.join(' ')).toContain('must be different');
    expect(report.repairPlan.canRepair).toBe(false);
  });

  it('evaluatePreflight_whenPortIsInvalid_returnsFailure', () => {
    const report = evaluatePreflight(validInput({ port: 70000 }));

    expect(report.status).toBe('fail');
    expect(report.failures.join(' ')).toContain('PORT');
  });
});
