import { logger } from '../logging/logger.js';

/**
 * HealthCheck — aggregates health status from all subsystems.
 *
 * @param {{ checks: Record<string, () => Promise<{ status: string, latencyMs?: number, [key: string]: any }>> }} deps
 *   checks is a map of check-name → async function returning health status.
 */
export function createHealthChecker({ checks = {} } = {}) {
  return {
    async check() {
      const results = {};
      let overall = 'ok';

      for (const [name, checkFn] of Object.entries(checks)) {
        try {
          const result = await checkFn();
          results[name] = result;
          if (result.status === 'down') overall = 'down';
          else if (result.status === 'degraded' && overall !== 'down') overall = 'degraded';
        } catch (e) {
          results[name] = { status: 'down', error: e.message };
          overall = 'down';
          logger.error({ err: e, check: name }, 'health check failed');
        }
      }

      return {
        status: overall,
        uptime: process.uptime(),
        timestamp: Date.now(),
        checks: results,
      };
    },
  };
}
