import { describe, test, expect } from 'vitest';
import { buildReadinessResponse } from '../domain/health/readinessRules.js';

describe('M1: buildReadinessResponse — real dependency checking', () => {
  const identity = {
    service: 'qclaudio',
    instanceId: 'test-1',
    version: '2.0.0',
    buildId: 'dev',
  };

  test('returns status "ready" when all dependencies are true', () => {
    const result = buildReadinessResponse({
      identity,
      dependencies: { db: true, neteaseApi: true },
    });

    expect(result.status).toBe('ready');
    expect(result.service).toBe('qclaudio');
    expect(result.instanceId).toBe('test-1');
    expect(result.dependencies).toEqual({ db: true, neteaseApi: true });
  });

  test('returns status "starting" when db is not ready', () => {
    const result = buildReadinessResponse({
      identity,
      dependencies: { db: false, neteaseApi: true },
    });

    expect(result.status).toBe('starting');
    expect(result.dependencies.db).toBe(false);
  });

  test('returns status "starting" when neteaseApi is not ready', () => {
    const result = buildReadinessResponse({
      identity,
      dependencies: { db: true, neteaseApi: false },
    });

    expect(result.status).toBe('starting');
    expect(result.dependencies.neteaseApi).toBe(false);
  });

  test('returns status "starting" when all dependencies are false', () => {
    const result = buildReadinessResponse({
      identity,
      dependencies: { db: false, neteaseApi: false },
    });

    expect(result.status).toBe('starting');
  });

  test('preserves identity fields in response', () => {
    const result = buildReadinessResponse({
      identity,
      dependencies: { db: true, neteaseApi: true },
    });

    expect(result.service).toBe('qclaudio');
    expect(result.version).toBe('2.0.0');
    expect(result.buildId).toBe('dev');
  });
});
