/**
 * startup.js — Extracted startup sequence for testability.
 *
 * This module receives all dependencies via the deps parameter (D8-compliant).
 * server.js calls startServer() with the wired dependencies.
 */

/**
 * Schedule the profile pipeline: first run after 10s, then periodic.
 * @param {object} services - Service container with profileSystem
 * @param {object} logger - Pino-style logger
 */
export function scheduleProfilePipeline(services, logger) {
  if (!services.profileSystem?.triggerCollection) return;

  const pipelineSources = services.profileSystem.pipelineSources || {};

  setTimeout(async () => {
    try {
      logger.info({ component: 'profile' }, 'first pipeline run');
      await services.profileSystem.triggerCollection(pipelineSources);
    } catch (e) {
      logger.error({ component: 'profile', err: e }, 'first pipeline run failed');
    }
  }, 10000);

  const intervalMs = (services.profileSystem.config?.schedule?.analysisIntervalHours || 1) * 60 * 60 * 1000;
  setInterval(async () => {
    try {
      await services.profileSystem.triggerCollection(pipelineSources);
    } catch (e) {
      logger.error({ component: 'profile', err: e }, 'periodic pipeline run failed');
    }
  }, intervalMs);

  logger.info(
    { component: 'profile', intervalHours: services.profileSystem.config?.schedule?.analysisIntervalHours || 1 },
    'profile pipeline scheduled'
  );
}

/**
 * Ensure NeteaseAPI is ready before attempting session restore.
 *
 * Called by restoreNeteaseSession() to avoid ECONNREFUSED errors when the
 * NeteaseAPI subprocess hasn't finished booting yet.  The initial
 * waitForNeteaseApi() in startServer() may time out (15s) if the subprocess
 * is slow to boot; this gives a second window before the first API call.
 *
 * @param {function} waitForReady - neteaseManager.waitForReady(timeoutMs)
 * @param {object} logger - Pino-style logger
 * @returns {Promise<boolean>} true if ready, false if still not ready
 */
export async function ensureNeteaseReadyForRestore(waitForReady, logger) {
  try {
    const ready = await waitForReady(15000);
    if (!ready) {
      logger.warn({ component: 'server' }, 'NeteaseAPI still not ready after extended wait — session restore may fail');
    }
    return ready;
  } catch (e) {
    logger.error({ component: 'server', err: e }, 'NeteaseAPI wait failed — session restore may fail');
    return false;
  }
}

/**
 * Start the server with the given dependencies.
 *
 * Key optimization: checkTtsHealth() runs asynchronously AFTER httpServer.listen()
 * so TTS health check never blocks HTTP listening.
 *
 * @param {object} deps - All startup dependencies
 */
export async function startServer(deps) {
  const {
    startNeteaseApi,
    waitForNeteaseApi,
    initDb,
    initProfileDb,
    setupSocketHandler,
    scheduleProfilePipeline: schedulePipeline,
    httpServer,
    checkTtsHealth,
    displayTtsHealthBanner,
    restoreNeteaseSession,
    config,
    services,
    io,
    logger,
    notifyReady = () => {},
  } = deps;

  // Port ownership must be resolved before the rest of startup proceeds.
  await startNeteaseApi();

  // 2. Wait for NeteaseAPI to be ready
  const ready = await waitForNeteaseApi();
  if (ready) {
    logger.info({ component: 'netease', port: config.netease.apiPort }, 'ready');
  } else {
    logger.warn({ component: 'netease' }, 'not ready after timeout, continuing anyway');
  }

  // 3. Initialize databases
  await initDb();
  initProfileDb();

  // 4. Set up socket handler
  setupSocketHandler(io, services);
  logger.info({ component: 'server' }, 'socket handler set up, callbacks wired');

  // 5. Schedule profile pipeline
  schedulePipeline(services, logger);

  // Listen errors such as EADDRINUSE are deterministic startup failures.
  await new Promise((resolve, reject) => {
    const handleError = error => reject(error);
    if (typeof httpServer.once === 'function') httpServer.once('error', handleError);
    httpServer.listen(config.port, () => {
      if (typeof httpServer.removeListener === 'function') httpServer.removeListener('error', handleError);
      resolve();
    });
  });
  logger.info({ component: 'server', port: config.port }, 'Qclaudio is ON AIR');
  console.log(`\n  \u{1F980}  Qclaudio 88.7 — http://localhost:${config.port}  |  Dashboard: http://localhost:${config.port}/dashboard\n`);
  notifyReady();

  // 7. Check TTS health asynchronously (non-blocking — runs after listen)
  checkTtsHealth().then(ttsHealth => {
    displayTtsHealthBanner(ttsHealth);
  }).catch(() => {
    // TTS health check failed — displayTtsHealthBanner handles unavailable state
  });

  // 8. Restore stored NetEase session in the background (non-blocking)
  restoreNeteaseSession().catch(e => {
    logger.error({ component: 'server', err: e }, 'restoreNeteaseSession failed');
  });
}
