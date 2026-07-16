import { randomUUID } from 'crypto';
import { logger } from './logger.js';

/**
 * Socket.IO middleware that assigns a traceId and child logger to each connection.
 *
 * Only registers io.use() middleware for traceId/logger assignment.
 * Connection and disconnect lifecycle logging is handled by handler.js's
 * setupSocketHandler to avoid duplicate connection handlers.
 *
 * @param {import('socket.io').Server} io - Socket.IO server instance.
 */
export function setupSocketLogger(io) {
  io.use((socket, next) => {
    socket.data.traceId = randomUUID();
    socket.data.log = logger.child({
      traceId: socket.data.traceId,
      socketId: socket.id,
      component: 'socket',
    });
    socket.data.log.info('client connected');
    next();
  });
}
