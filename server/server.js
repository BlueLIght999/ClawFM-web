import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import config from './config.js';
import { initDb } from './db/schema.js';
import { initProfileDb } from './db/profileDb.js';
import { setupSocketHandler } from './socket/handler.js';
import { createServices } from './bootstrap.js';
import { httpLogger } from './infrastructure/logging/httpLogger.js';
import { setupSocketLogger } from './infrastructure/logging/socketLogger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: ['http://localhost:5173', 'http://localhost:3333'], methods: ['GET', 'POST'] },
  // Fast disconnect detection: default 25s+20s means up to 45s delay.
  // With 5s+3s, clients detect a dead server within ~8s even if TCP
  // doesn't close cleanly.
  pingInterval: 5000,
  pingTimeout: 3000,
});

app.use(cors());
app.use(httpLogger());
app.use(express.json());

const services = createServices(io);
const {
  authenticationService,
  musicSource,
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

// ─── Observability endpoints ──────────────────────────────

// Socket logger middleware
setupSocketLogger(io);

// Dashboard namespace
const dashboardNsp = io.of('/dashboard');
dashboardNsp.on('connection', async (socket) => {
  logger.info({ socketId: socket.id }, 'dashboard client connected');
  logStream.subscribe(socket);

  // Send initial full state so the dashboard has data immediately on connect
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

  // Periodically push health updates to this client
  const healthTimer = setInterval(async () => {
    try {
      socket.emit('dashboard:health', await healthChecker.check());
    } catch { /* client may have disconnected */ }
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

// Health check endpoint
app.get('/health', async (req, res) => {
  const result = await healthChecker.check();
  const statusCode = result.status === 'ok' ? 200 : result.status === 'degraded' ? 200 : 503;
  res.status(statusCode).json(result);
});

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', metricsCollector.registry.contentType);
  res.end(await metricsCollector.metricsText());
});

// JSON metrics snapshot for dashboard
app.get('/api/metrics/json', async (req, res) => {
  res.json(await metricsCollector.metricsJSON());
});

// Dashboard page
app.get('/dashboard', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'dashboard', 'index.html'));
});

// Profile panel page
app.get('/dashboard/profile', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'dashboard', 'profile-panel.html'));
});

// Auth status endpoint
app.get('/api/auth/status', async (req, res) => {
  res.json(await authenticationService.currentStatus());
});

// GET /api/playlists — user playlists
app.get('/api/playlists', async (req, res) => {
  try {
    const uid = recommender.uid;
    if (!uid) return res.json({ playlists: [] });
    const playlists = (await musicSource.userPlaylists(uid)).map(p => ({
      id: p.id,
      name: p.name,
      trackCount: p.trackCount,
      playCount: p.playCount,
      coverImgUrl: p.coverImgUrl,
    }));
    res.json({ playlists });
  } catch (e) {
    res.json({ playlists: [], error: e.message });
  }
});

// GET /api/playlist/:id/tracks — tracks in a playlist
app.get('/api/playlist/:id/tracks', async (req, res) => {
  try {
    const tracks = await musicSource.playlistTracks(req.params.id);
    res.json({ tracks });
  } catch (e) {
    res.json({ tracks: [], error: e.message });
  }
});

// POST /api/playlist/:id/play — queue entire playlist
app.post('/api/playlist/:id/play', async (req, res) => {
  try {
    const tracks = await musicSource.playlistTracks(req.params.id);
    if (tracks.length > 0) {
      queue.clear();
      queue.addSongs(tracks);
      io.emit('radio:queue-update', { upcomingSongs: queue.upcomingSongs });
      await scheduler.startWithQueue();
      io.emit('radio:state', scheduler.getState());
      res.json({ ok: true, count: tracks.length });
    } else {
      res.json({ ok: false, error: 'No tracks found' });
    }
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// === REST Endpoints (Blueprint Layer 4: HTTP Contract) ===

// GET /api/now — current playback state
app.get('/api/now', (req, res) => {
  res.json(scheduler.getState());
});

// GET /api/next — upcoming song
app.get('/api/next', (req, res) => {
  const next = queue.peek();
  res.json({ nextSong: next || null, queueLength: queue.length });
});

// GET /api/lyric/:id — song lyrics
app.get('/api/lyric/:id', async (req, res) => {
  try {
    const lyric = await musicSource.lyric(req.params.id);
    const lrc = lyric?.lrc || '';
    const tlrc = lyric?.tlrc || '';
    res.json({ lrc, tlrc });
  } catch (e) {
    res.json({ lrc: '', tlrc: '', error: e.message });
  }
});

// GET /api/taste — user taste profile
app.get('/api/taste', (req, res) => {
  const profile = listenerProfileRepository.get();
  res.json({
    topArtists: (profile.topArtists || []).slice(0, 10),
    topGenres: (profile.analysis?.topGenres || []),
    totalSongs: profile.analysis?.totalSongs || 0,
    currentMood: getTimeOfDayMood(),
  });
});

// GET /api/profile — full profile system data for dashboard panel
app.get('/api/profile', async (req, res) => {
  try {
    if (!services.profileSystem) {
      return res.json({ ok: false, error: 'Profile system not initialized', profile: null });
    }
    const port = services.profileSystem;
    // Use facade methods (getSnapshots, getCurrentCluster, getCurrentProfile)
    // directly on profileSystem — NOT on the raw orchestrator
    const snapshots = port.getSnapshots ? port.getSnapshots(1) : [];
    const cluster = port.getCurrentCluster ? port.getCurrentCluster() : null;
    const profile = snapshots[0] || (await port.getCurrentProfile?.()) || null;
    res.json({ ok: true, profile, cluster, snapshotCount: snapshots.length });
  } catch (e) {
    res.json({ ok: false, error: e.message, profile: null });
  }
});

// GET /api/weather — current weather
app.get('/api/weather', async (req, res) => {
  try {
    const text = await getWeather();
    res.json({ ok: true, text });
  } catch (e) {
    res.json({ ok: false, text: '', error: e.message });
  }
});

// GET /api/plan/today — current DJ listening plan
app.get('/api/plan/today', async (req, res) => {
  try {
    const force = req.query.force === 'true';
    const cached = getPlan();
    if (force || !cached || isPlanStale()) {
      const newPlan = await generatePlan(force);
      res.json(newPlan);
    } else {
      res.json(cached.plan);
    }
  } catch (e) {
    res.json({ error: e.message, blocks: [], mood: getTimeOfDayMood() });
  }
});

// GET /api/tts/status — TTS provider health
app.get('/api/tts/status', async (req, res) => {
  try {
    let status = getTtsStatus();
    if (!status.checked) {
      status = await checkTtsHealth();
    }
    res.json(status);
  } catch (e) {
    res.json({ available: false, provider: null, reason: e.message });
  }
});

// Serve TTS audio
app.use('/audio/tts', express.static(config.tts.outputDir));

// Serve client dist (always — needed for the radio to work)
const clientDist = path.resolve(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist, {
  setHeaders: (res, p) => {
    if (p.endsWith('.html')) {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (p.match(/\.(js|css|woff2?|png|jpg|svg|ico)$/)) {
      res.set('Cache-Control', 'public, max-age=3600');
    }
  }
}));
app.get('*', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.resolve(clientDist, 'index.html'));
});

let neteaseProc = null;
let neteaseRestartCount = 0;
const NETEASE_MAX_RESTARTS = 5;

function startNeteaseApi() {
  const neteaseApiDir = path.resolve(__dirname, 'node_modules', 'NeteaseCloudMusicApi');
  neteaseProc = spawn('node', ['app.js'], {
    cwd: neteaseApiDir,
    env: { ...process.env, PORT: String(config.netease.apiPort) },
    stdio: 'pipe',
  });
  neteaseProc.stdout.on('data', (d) => {
    const msg = d.toString().trim();
    if (msg) logger.info({ component: 'netease' }, msg);
  });
  neteaseProc.stderr.on('data', (d) => {
    logger.error({ component: 'netease' }, d.toString().trim());
  });
  neteaseProc.on('close', (code) => {
    logger.info({ component: 'netease', code }, 'process exited');
    if (code !== 0 && code !== null) {
      if (neteaseRestartCount >= NETEASE_MAX_RESTARTS) {
        logger.error({ component: 'netease', port: config.netease.apiPort, attempts: NETEASE_MAX_RESTARTS }, 'max restart attempts reached — giving up');
        return;
      }
      neteaseRestartCount++;
      const delay = Math.min(3000 * Math.pow(2, neteaseRestartCount - 1), 30000);
      logger.warn({ component: 'netease', attempt: neteaseRestartCount, max: NETEASE_MAX_RESTARTS, delayMs: delay }, 'auto-restarting');
      setTimeout(() => startNeteaseApi(), delay);
    }
  });
}

function isNeteaseApiResponse(body) {
  if (!body || typeof body !== 'object') return false;
  if ('code' in body) return true;
  return body.data && typeof body.data === 'object' && 'code' in body.data;
}

async function waitForNeteaseApi(timeoutMs = 15000) {
  const start = Date.now();
  const healthUrl = `http://localhost:${config.netease.apiPort}/login/status`;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(healthUrl);
      if (res.ok) {
        const body = await res.json();
        if (isNeteaseApiResponse(body)) return true;
      }
    } catch (e) {
      // NetEase API may still be booting; keep polling until timeout.
      console.debug('[Server] Netease health check retry:', e.message);
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

// Start
async function start() {
  startNeteaseApi();
  const ready = await waitForNeteaseApi();
  if (ready) {
    logger.info({ component: 'netease', port: config.netease.apiPort }, 'ready');
  } else {
    logger.warn({ component: 'netease' }, 'not ready after timeout, continuing anyway');
  }

  await initDb();
  initProfileDb();
  setupSocketHandler(io, services);
  logger.info({ component: 'server' }, 'socket handler set up, callbacks wired');

  // Start profile pipeline: first run after 10s, then periodic
  if (services.profileSystem?.triggerCollection) {
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
    logger.info({ component: 'profile', intervalHours: services.profileSystem.config?.schedule?.analysisIntervalHours || 1 }, 'profile pipeline scheduled');
  }

  const ttsHealth = await checkTtsHealth();
  displayTtsHealthBanner(ttsHealth);

  // Start listening FIRST so the client can connect immediately.
  // Session restoration runs in the background — if a stored cookie
  // exists, the queue will be ready by the time the user interacts.
  httpServer.listen(config.port, () => {
    logger.info({ component: 'server', port: config.port }, 'Qclaudio is ON AIR');
    console.log(`\n  \u{1F980}  Qclaudio 88.7 — http://localhost:${config.port}  |  Dashboard: http://localhost:${config.port}/dashboard\n`);
  });

  // Restore stored NetEase session in the background (non-blocking)
  restoreNeteaseSession().catch(e => {
    logger.error({ component: 'server', err: e }, 'restoreNeteaseSession failed');
  });
}

function displayTtsHealthBanner(ttsHealth) {
  if (!ttsHealth.available) {
    logger.warn({ component: 'tts', reason: ttsHealth.reason }, 'TTS service unavailable — DJ speech will be text-only');
  } else if (ttsHealth.provider === 'edge') {
    logger.warn({ component: 'tts', provider: 'edge' }, 'using Edge TTS fallback — DashScope unavailable');
  }
}

async function restoreNeteaseSession() {
  try {
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
      } else {
        logger.info({ component: 'server' }, 'queue still empty after fillQueue');
      }
    }
  } catch (e) {
    logger.error({ component: 'server', err: e }, 'auto-start skipped');
  }
}

// ─── Graceful shutdown ───────────────────────────────────────────
// Bug L8: Clean up subprocesses and close HTTP server on signal

let shuttingDown = false;

function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ component: 'server', signal }, 'graceful shutdown started');

  // Kill NeteaseAPI subprocess
  if (neteaseProc && !neteaseProc.killed) {
    neteaseProc.kill('SIGTERM');
    logger.info({ component: 'netease' }, 'subprocess terminated');
  }

  // Stop metrics pusher
  if (metricsPusher) metricsPusher.stop();

  // Close Socket.IO first — forcefully disconnects all clients immediately.
  // This triggers 'disconnect' on the client side so it can pause audio
  // without waiting for TCP timeout (default 25s+20s ping interval).
  io.close(() => {
    logger.info({ component: 'server' }, 'Socket.IO closed');
  });

  // Close HTTP server
  httpServer.close((err) => {
    if (err) {
      logger.error({ component: 'server', err }, 'error closing HTTP server');
    } else {
      logger.info({ component: 'server' }, 'HTTP server closed');
    }
    process.exit(0);
  });

  // Force exit after 5s if httpServer.close hangs
  setTimeout(() => {
    logger.warn({ component: 'server' }, 'graceful shutdown timeout — forcing exit');
    process.exit(1);
  }, 5000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

start();
