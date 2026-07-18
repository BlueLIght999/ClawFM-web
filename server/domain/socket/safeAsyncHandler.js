/**
 * Safe async socket handler wrapper — prevents unhandled rejections.
 *
 * Wraps an async socket event handler so that any rejection or synchronous
 * throw is caught and logged, instead of crashing the process.
 */

/**
 * Wrap an async socket handler with error boundary.
 *
 * @param {Function} handler Async socket event handler.
 * @param {{onError?: Function}} options Optional error callback.
 * @returns {Function} Wrapped handler that never throws.
 * @throws Does not throw.
 */
export function safeAsyncHandler(handler, { onError } = {}) {
  return async function safeWrapped(...args) {
    try {
      return await handler(...args);
    } catch (e) {
      console.error('[Socket handler error]', e);
      if (onError) onError(e);
    }
  };
}
