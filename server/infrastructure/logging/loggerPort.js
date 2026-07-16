/**
 * LoggerPort — interface contract for application/domain layers.
 *
 * Following the project's Port pattern, domain and application services depend
 * on this interface rather than the concrete Pino logger. bootstrap.js wires
 * the real logger implementation.
 *
 * @typedef {object} LoggerPort
 * @property {(msg: string, data?: object) => void} info
 * @property {(msg: string, data?: object) => void} warn
 * @property {(msg: string, data?: object) => void} error
 * @property {(msg: string, data?: object) => void} debug
 * @property {(bindings: object) => LoggerPort} child
 */

/**
 * No-op logger that silently discards all output.
 * Used as a default when no logger is injected.
 */
export const nullLogger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
  child() { return nullLogger; },
};
