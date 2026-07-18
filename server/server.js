/**
 * Server — thin orchestration layer.
 *
 * HTTP routes extracted to infrastructure/http/httpRoutes.js
 * NeteaseAPI subprocess management extracted to infrastructure/netease/NeteaseProcessManager.js
 *
 * This file now only:
 *   1. Creates Express app + HTTP server + Socket.IO
 *   2. Wires services from bootstrap
 *   3. Registers HTTP routes via registerHttpRoutes()
 *   4. Delegates startup to startup.js
 *   5. Manages graceful shutdown
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import config from './config.js';
import { initDb, closeDb, getDb } from './db/schema.js';
import { initProfileDb } from './db/profileDb.js';
import { setupSocketHandler } from './socket/handler.js';
import { createServices } from './bootstrap.js';
import { httpLogger } from './infrastructure/logging/httpLogger.js';
import { setupSocketLogger } from './infrastructure/logging/socketLogger.js';
import { startServer, scheduleProfilePipeline, ensureNeteaseReadyForRestore } from './startup.js';
import { registerHttpRoutes } from './infrastructure/http/httpRoutes.js';
import { NeteaseProcessManager } from './infrastructure/netease/NeteaseProcessManager.js';
import { createReadiness } from './infrastructure/health/readiness.js';
import { buildReadinessResponse } from './domain/health/readinessRules.js';
import { createVersionedRadioEmitter } from './socket/versionedRadioEmitter.js';
import { triggerColdStartIfPending } from './socket/coldStartHandler.js';

// Global error handlers — prevent process crash from unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught Exception:', err);
});

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: ['http://localhost:5173', 'http://localhost:3333'], methods: ['GET', 'POST'] },
  pingInterval: 5000,
  pingTimeout: 3000,
});

app.use(cors());
app.use(httpLogger());
app.use(express.json());

const services = createServices(io);
const readiness = createReadiness();
const radioEmitter = createVersionedRadioEmitter(io);

// NeteaseAPI subprocess manager (extracted to infrastructure/netease/NeteaseProcessManager.js)
const neteaseManager = new NeteaseProcessManager({ logger: services.logger, config });

// M1: Dynamic readiness checker — reports real dependency states
const readinessChecker = () => {
  let dbReady = false;
  try { dbReady = !!getDb(); } catch { /* DB not initialized yet */ }
  const neteaseReady = !!neteaseManager?.process && !neteaseManager.process.killed;
  return buildReadinessResponse({
    identity: readiness,
    dependencies: { db: dbReady, neteaseApi: neteaseReady },
  });
};
const {
  authenticationService,
  recommender,
  queue,
  scheduler,
  listenerProfileRepository,
  getTimeOfDayMood,
  checkTtsHealth,
  getTtsStatus,
  generatePlan,
  getPlan,
  isPlanStale,
  getWeather,
  logger,
  logStream,
  metricsCollector,
  metricsPusher,
  healthChecker,
} = services;

// Socket logger middleware
setupSocketLogger(io);

// Dashboard namespace
const dashboardNsp = io.of('/dashboard');
dashboardNsp.on('connection', async (socket) => {
  logger.info({ socketId: socket.id }, 'dashboard client connected');
  logStream.subscribe(socket);

  try {
    const [healthResult, metricsSnapshot] = await Promise.all([
      healthChecker.check(),
      metricsCollector.metricsJSON(),
    ]);
    socket.emit('dashboard:full', {
      logs: logStream.getBuffer(),
      metrics: metricsSnapshot,
      health: healthResult,
      events: [],
      currentSong: scheduler.getState()?.currentSong || null,
    });
    socket.emit('dashboard:health', healthResult);
  } catch (e) {
    logger.warn({ component: 'dashboard', err: e }, 'failed to send initial state');
  }

  const healthTimer = setInterval(async () => {
    try { socket.emit('dashboard:health', await healthChecker.check()); } catch { /* disconnected */ }
  }, 15000);

  socket.on('subscribe', (filter) => {
    logStream.unsubscribe(socket);
    logStream.subscribe(socket, filter);
  });

  socket.on('disconnect', () => {
    logStream.unsubscribe(socket);
    clearInterval(healthTimer);
    logger.info({ socketId: socket.id }, 'dashboard client disconnected');
  });
});

// Start metrics pusher
if (config.metrics.enabled) {
  metricsPusher.start();
}

// Register all HTTP routes (extracted to infrastructure/http/httpRoutes.js)
registerHttpRoutes(app, {
  healthChecker,
  metricsCollector,
  authenticationService,
  musicSource: services.musicSource,
  recommender,
  queue,
  scheduler,
  listenerProfileRepository,
  getTimeOfDayMood,
  getWeather,
  getPlan,
  isPlanStale,
  generatePlan,
  getTtsStatus,
  checkTtsHealth,
  profileSystem: services.profileSystem,
  config,
  radioEmitter,
  logger,
  readiness,
  readinessChecker,
});

function displayTtsHealthBanner(ttsHealth) {
  if (!ttsHealth.available) {
    logger.warn({ component: 'tts', reason: ttsHealth.reason }, 'TTS service unavailable — DJ speech will be text-only');
  } else if (ttsHealth.provider === 'edge') {
    logger.warn({ component: 'tts', provider: 'edge' }, 'using Edge TTS fallback — DashScope unavailable');
  }
}

async function restoreNeteaseSession() {
  try {
    // Wait for NeteaseAPI to be ready before calling any endpoints.
    // The initial waitForNeteaseApi() in startServer() may have timed out
    // if the subprocess was slow to boot; this gives a second window.
    const ready = await ensureNeteaseReadyForRestore(
      (timeout) => neteaseManager.waitForReady(timeout),
      logger,
    );
    if (!ready) {
      logger.warn({ component: 'server' }, 'session restore skipped — NeteaseAPI not ready');
      return;
    }

    const restoredSession = await authenticationService.restoreStoredSession();
    const preview = restoredSession.cookiePreview;
    logger.info({ component: 'server', cookieFound: !!preview }, `cookie loaded: ${preview ? 'YES' : 'NO'}`);

    if (!restoredSession.cookieFound) {
      logger.info({ component: 'server' }, 'no NetEase cookie found — login required');
    } else if (!restoredSession.restored) {
      logger.info({ component: 'server' }, 'auto-start skipped: no authenticated NetEase profile');
    } else {
      logger.info({ component: 'server' }, 'NetEase cookie loaded');
      if (restoredSession.planGenerated) {
        logger.info({ component: 'server' }, 'initial listening plan generated');
      } else if (restoredSession.planError) {
        logger.info({ component: 'server', error: restoredSession.planError }, 'initial plan skipped');
      }
      logger.info({ component: 'server', queueLength: restoredSession.queueLength }, 'queue filled');
      if (restoredSession.queuePrepared) {
        logger.info({ component: 'server', song: restoredSession.currentSongTitle }, 'queue prepared, awaiting first client');
        triggerColdStartIfPending(io, services).catch(e => {
          logger.error({ component: 'server', err: e }, 'cold start re-trigger after queue fill failed');
        });
      } else {
        logger.info({ component: 'server' }, 'queue still empty after fillQueue');
      }
    }
  } catch (e) {
    logger.error({ component: 'server', err: e }, 'auto-start skipped');
  }
}

// Start — delegates to startup.js for testable startup sequence
startServer({
  startNeteaseApi: () => neteaseManager.ensureStarted(),
  waitForNeteaseApi: (timeout) => neteaseManager.waitForReady(timeout),
  initDb,
  initProfileDb,
  setupSocketHandler,
  scheduleProfilePipeline,
  httpServer,
  checkTtsHealth,
  displayTtsHealthBanner,
  restoreNeteaseSession,
  config,
  services,
  io,
  logger,
  notifyReady: () => {
    if (typeof process.send === 'function') process.send({ type: 'ready', readiness });
  },
}).catch((error) => {
  logger.error({ component: 'server', err: error }, 'startup failed');
  neteaseManager.terminate();
  process.exit(1);
});

// ─── Graceful shutdown ───────────────────────────────────────────
let shuttingDown = false;

function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ component: 'server', signal }, 'graceful shutdown started');

  neteaseManager.terminate();

  if (metricsPusher) metricsPusher.stop();

  // M2: Flush pending DB writes and close database cleanly
  try { closeDb(); } catch (e) { logger.error({ component: 'server', err: e }, 'DB close failed'); }

  io.close(() => {
    logger.info({ component: 'server' }, 'Socket.IO closed');
  });

  httpServer.close((err) => {
    if (err) {
      logger.error({ component: 'server', err }, 'error closing HTTP server');
    } else {
      logger.info({ component: 'server' }, 'HTTP server closed');
    }
    process.exit(0);
  });

  setTimeout(() => {
    logger.warn({ component: 'server' }, 'graceful shutdown timeout — forcing exit');
    process.exit(1);
  }, 5000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('message', (message) => {
  if (message?.type === 'shutdown') gracefulShutdown('IPC');
});
