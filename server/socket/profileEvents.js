/**
 * Profile system socket events — wires profile/cluster/analysis events
 * from the EventBus to socket.io broadcasts.
 * Extracted from handler.js for single-responsibility.
 */
import { EVENTS } from './events.js';

export function wireProfileEvents(io, deps) {
  if (!deps.profileSystem) return;
  const { eventBus } = deps.profileSystem;
  if (!eventBus) return;

  eventBus.on('profile:updated', (data) => {
    io.emit(EVENTS.PROFILE_UPDATED, sanitizeProfileForClient(data?.profile || data));
  });

  eventBus.on('analysis:completed', (data) => {
    io.emit(EVENTS.PROFILE_ANALYSIS, sanitizeProfileForClient(data?.result || data));
  });

  eventBus.on('cluster:changed', (data) => {
    io.emit(EVENTS.PROFILE_CLUSTER, sanitizeProfileForClient(data?.cluster || data));
  });

  if (deps.logger) {
    deps.logger.info('[Profile] Socket events wired');
  }
}

/**
 * Remove internal/raw fields, keep only client-safe data.
 * @param {object} obj
 * @returns {object}
 */
function sanitizeProfileForClient(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const { raw: _raw, _enriched, _source, ...safe } = obj;
  return safe;
}
