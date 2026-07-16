/**
 * BaseCollector — abstract base class for profile evidence collectors.
 *
 * Domain-layer abstraction. Concrete collectors extend this and implement
 * collect(sources). No IO lives here; repositories/clients are injected via
 * the collect() arguments, so the domain stays pure (CODING-STYLE / SEAMS).
 *
 * Subclasses receive their dependencies as constructor or function
 * parameters — never import infrastructure, db, or application layers.
 */

export class BaseCollector {
  /**
   * @param {Object}  [opts]
   * @param {string}  [opts.name]     — collector display name (defaults to class name)
   * @param {Object}  [opts.eventBus] — optional bus exposing emit(type, payload)
   */
  constructor({ name, eventBus } = {}) {
    this.name = name || this.constructor.name;
    this.eventBus = eventBus || null;
  }

  /**
   * Collect evidence from injected sources.
   * @param {Object} sources — collector-specific dependencies (repositories/fns)
   * @returns {Promise<Object>} collector-specific result shape.
   * @throws always — subclasses must override.
   */
  async collect(_sources) {
    throw new Error('Not implemented');
  }

  /**
   * ISO timestamp marking when evidence was gathered.
   */
  get collectedAt() {
    return new Date().toISOString();
  }

  /**
   * Emit a domain event on the optional event bus. The collector name is
   * always merged into the payload so consumers can attribute the event.
   * No-op when no eventBus was injected.
   * @param {string} eventType
   * @param {Object} payload
   */
  emit(eventType, payload) {
    if (this.eventBus) {
      this.eventBus.emit(eventType, { collector: this.name, ...payload });
    }
  }
}
