import { describe, it, expect } from 'vitest';
import { createHealthChecker } from '../infrastructure/health/healthCheck.js';

describe('HealthChecker', () => {
  it('returnsOkWhenAllChecksPass', async () => {
    const checker = createHealthChecker({
      checks: {
        db: async () => ({ status: 'up' }),
        api: async () => ({ status: 'up', latencyMs: 42 }),
      },
    });
    const result = await checker.check();
    expect(result.status).toBe('ok');
    expect(result.uptime).toBeGreaterThan(0);
    expect(result.checks.db.status).toBe('up');
    expect(result.checks.api.latencyMs).toBe(42);
  });

  it('returnsDegradedWhenAnyCheckIsDegraded', async () => {
    const checker = createHealthChecker({
      checks: {
        db: async () => ({ status: 'up' }),
        tts: async () => ({ status: 'degraded' }),
      },
    });
    const result = await checker.check();
    expect(result.status).toBe('degraded');
  });

  it('returnsDownWhenAnyCheckIsDown', async () => {
    const checker = createHealthChecker({
      checks: {
        db: async () => ({ status: 'up' }),
        redis: async () => ({ status: 'down' }),
      },
    });
    const result = await checker.check();
    expect(result.status).toBe('down');
    expect(result.checks.redis.status).toBe('down');
  });

  it('returnsDownWhenCheckThrows', async () => {
    const checker = createHealthChecker({
      checks: {
        flaky: async () => { throw new Error('connection refused'); },
      },
    });
    const result = await checker.check();
    expect(result.status).toBe('down');
    expect(result.checks.flaky.status).toBe('down');
    expect(result.checks.flaky.error).toContain('connection refused');
  });

  it('downTakesPriorityOverDegraded', async () => {
    const checker = createHealthChecker({
      checks: {
        a: async () => ({ status: 'degraded' }),
        b: async () => ({ status: 'down' }),
      },
    });
    const result = await checker.check();
    expect(result.status).toBe('down');
  });

  it('handlesEmptyChecks', async () => {
    const checker = createHealthChecker({ checks: {} });
    const result = await checker.check();
    expect(result.status).toBe('ok');
    expect(Object.keys(result.checks)).toHaveLength(0);
  });

  it('includesTimestamp', async () => {
    const checker = createHealthChecker({ checks: {} });
    const result = await checker.check();
    expect(result.timestamp).toBeGreaterThan(0);
  });
});
