/**
 * readinessRules — builds dynamic readiness response from dependency states.
 *
 * Problem (M1): `/health/ready` returned a static frozen object with
 * `status: 'ready'` without checking if DB or NeteaseAPI were actually
 * initialized. The launcher could think the server was ready when it
 * wasn't.
 *
 * Solution: compute status from actual dependency states.
 */

export function buildReadinessResponse({ identity, dependencies }) {
  const allReady = Object.values(dependencies).every(v => v === true);
  return {
    ...identity,
    status: allReady ? 'ready' : 'starting',
    dependencies,
  };
}
