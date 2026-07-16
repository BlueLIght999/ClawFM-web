import { Writable } from 'stream';

const MAX_BUFFER = 500;
const LEVEL_PRIORITY = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 };

/**
 * LogStream — a Writable stream that captures Pino log output and broadcasts
 * it to connected dashboard clients via Socket.IO.
 *
 * Inspired by Directus's LogsStream pattern.
 */
export class LogStream extends Writable {
  constructor() {
    super({ objectMode: true });
    this._buffer = [];
    this._subscribers = new Map(); // socket -> { minLevel, tags }
  }

  /**
   * Register a dashboard client to receive log updates.
   * @param {import('socket.io').Socket} socket
   * @param {{ minLevel?: string, tags?: string[] }} filter
   */
  subscribe(socket, filter = {}) {
    this._subscribers.set(socket, {
      minLevel: filter.minLevel || 'debug',
      tags: filter.tags || [],
    });
    // Send buffered logs to new subscriber
    const minPriority = LEVEL_PRIORITY[filter.minLevel] || 10;
    for (const entry of this._buffer) {
      if (entry.level >= minPriority) {
        socket.emit('dashboard:log', entry);
      }
    }
  }

  /** Remove a dashboard client. */
  unsubscribe(socket) {
    this._subscribers.delete(socket);
  }

  _write(chunk, _encoding, callback) {
    try {
      let data = chunk;
      if (Buffer.isBuffer(data)) data = data.toString();
      if (typeof data === 'string') data = data.trim();
      if (!data) { callback(); return; }
      const entry = typeof data === 'string' ? JSON.parse(data) : data;
      this._addToBuffer(entry);
      this._broadcast(entry);
    } catch {
      const entry = { time: Date.now(), level: 30, msg: String(chunk) };
      this._addToBuffer(entry);
      this._broadcast(entry);
    }
    callback();
  }

  _addToBuffer(entry) {
    this._buffer.push(entry);
    if (this._buffer.length > MAX_BUFFER) {
      this._buffer.shift();
    }
  }

  _broadcast(entry) {
    for (const [socket, filter] of this._subscribers) {
      const minPriority = LEVEL_PRIORITY[filter.minLevel] || 10;
      if (entry.level < minPriority) continue;
      if (filter.tags.length > 0) {
        const entryTags = entry.tags || entry.component || '';
        if (!filter.tags.some(t => String(entryTags).includes(t))) continue;
      }
      socket.emit('dashboard:log', entry);
    }
  }

  /** Get the current log buffer (for initial full state). */
  getBuffer() {
    return [...this._buffer];
  }

  /** Get subscriber count. */
  get subscriberCount() {
    return this._subscribers.size;
  }
}

// ─── Singleton accessor ──────────────────────────────────────────
// Allows logger.js to connect to the same LogStream instance that
// bootstrap.js uses for dashboard subscriptions.

let _instance = null;

/**
 * Get the singleton LogStream instance.
 * @returns {LogStream}
 */
export function getLogStream() {
  if (!_instance) _instance = new LogStream();
  return _instance;
}
