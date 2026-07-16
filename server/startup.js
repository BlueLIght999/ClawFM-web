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
  } = deps;

  // 1. Start NeteaseAPI subprocess (non-blocking)
  startNeteaseApi();

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

  // 6. Start listening — client can connect immediately
  httpServer.listen(config.port, () => {
    logger.info({ component: 'server', port: config.port }, 'Qclaudio is ON AIR');
    console.log(`\n  \u{1F980}  Qclaudio 88.7 — http://localhost:${config.port}  |  Dashboard: http://localhost:${config.port}/dashboard\n`);
  });

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
