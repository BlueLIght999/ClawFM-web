import { randomUUID } from 'crypto';
import { logger } from './logger.js';

// Static file extensions and path prefixes that should NOT be logged.
// Logging every static asset request floods the log and adds latency
// through the pino pipeline during page load.
const STATIC_EXTENSIONS = [
  '.js', '.css', '.woff', '.woff2', '.ttf', '.eot',
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
  '.webp', '.map', '.mp3', '.mp4', '.webm',
];

const STATIC_PREFIXES = ['/assets/', '/audio/tts/'];

function isStaticRequest(req) {
  const url = req.url || req.path || '';
  if (STATIC_PREFIXES.some(prefix => url.startsWith(prefix))) return true;
  return STATIC_EXTENSIONS.some(ext => url.endsWith(ext));
}

/**
 * Express middleware that attaches a request-scoped child logger to each
 * incoming HTTP request.
 *
 * - Generates a unique requestId per request
 * - Creates a Pino child logger with { requestId, method, url }
 * - Logs request completion with status code and response time
 * - Skips static file requests to avoid log flooding and reduce latency
 *
 * @returns {(req: import('express').Request, res: import('express').Response, next: Function) => void}
 */
export function httpLogger() {
  return (req, res, next) => {
    if (isStaticRequest(req)) {
      return next();
    }

    const requestId = req.headers['x-request-id'] || randomUUID();
    req.id = requestId;
    req.log = logger.child({ requestId, method: req.method, url: req.url });

    req.log.info({ query: req.query }, 'incoming request');

    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      req.log.info({
        statusCode: res.statusCode,
        durationMs: duration,
      }, 'request completed');
    });

    next();
  };
}
