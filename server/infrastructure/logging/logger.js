import pino from 'pino';
import pretty from 'pino-pretty';
import config from '../../config.js';
import { getLogStream } from './logStream.js';

const isDev = config.nodeEnv !== 'production';
const level = config.logging?.level || 'info';
const style = config.logging?.style || (isDev ? 'pretty' : 'json');

const logStream = getLogStream();

const streams = style === 'pretty'
  ? [
      { level, stream: pretty({ colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' }) },
      { level, stream: logStream },
    ]
  : [
      { level, stream: process.stdout },
      { level, stream: logStream },
    ];

/**
 * Shared Pino logger instance.
 *
 * Outputs structured JSON in production and pretty-printed colorized logs in
 * development. Sensitive fields are automatically redacted.
 *
 * Uses pino.multistream to write simultaneously to stdout (or pino-pretty in
 * dev) and the LogStream singleton for dashboard real-time log streaming.
 * No worker thread transport is used — all formatting is synchronous.
 */
export const logger = pino(
  {
    level,
    redact: {
      paths: [
        'cookie',
        'apiKey',
        'token',
        'authorization',
        'password',
        'req.headers.cookie',
        'req.headers.authorization',
        '*.apiKey',
        '*.token',
        '*.password',
      ],
      censor: '[REDACTED]',
    },
    base: { service: 'qclaudio-radio' },
  },
  pino.multistream(streams),
);

/**
 * Create a child logger with additional bindings (e.g. { component: 'scheduler' }).
 * @param {object} bindings - Context to attach to all log entries.
 * @returns {import('pino').Logger} Child logger.
 */
export function createChildLogger(bindings) {
  return logger.child(bindings);
}
