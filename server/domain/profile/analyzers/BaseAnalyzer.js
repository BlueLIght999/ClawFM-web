/**
 * Abstract base class for all profile analyzers.
 * Analyzers receive a built profile + evidence and produce analysis results.
 */
export class BaseAnalyzer {
  constructor({ name, eventBus } = {}) {
    this.name = name || this.constructor.name;
    this.eventBus = eventBus || null;
  }

  /**
   * Analyze the profile and return analysis results.
   * @param {object} profile — the built user profile
   * @param {object} options — additional evidence and context
   * @returns {Promise<object>} analysis result
   */
  async analyze(_profile, _options = {}) {
    throw new Error('Not implemented');
  }

  /**
   * Emit an event through the event bus if one is attached.
   * @param {string} eventType — event type string
   * @param {object} payload — event payload
   */
  emit(eventType, payload) {
    if (this.eventBus) {
      this.eventBus.emit(eventType, { analyzer: this.name, ...payload });
    }
  }
}
