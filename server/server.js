import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import config from './config.js';
import { initDb } from './db/schema.js';
import { setupSocketHandler } from './socket/handler.js';
import { recommender } from './services/recommender.js';
import { queue } from './services/queue.js';
import { scheduler } from './services/scheduler.js';
import { legacyListenerProfileRepository } from './infrastructure/persistence/repositories/LegacyListenerProfileRepository.js';
import { getTimeOfDayMood } from './services/context.js';
import { checkTtsHealth, getTtsStatus } from './services/tts.js';
import { generatePlan as generateInitialPlan } from './services/planner.js';
import { createAuthenticationService } from './application/services/AuthenticationService.js';
import { legacyNeteaseAuthClient } from './infrastructure/auth/LegacyNeteaseAuthClient.js';
import { legacyAuthRepository } from './infrastructure/persistence/repositories/LegacyAuthRepository.js';
import { legacyNeteaseMusicSourceAdapter } from './infrastructure/music/LegacyNeteaseMusicSourceAdapter.js';
import { SocketEventPublisher } from './socket/SocketEventPublisher.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: ['http://localhost:5173', 'http://localhost:3333'], methods: ['GET', 'POST'] },
});

app.use(cors());
app.use(express.json());

const authenticationService = createAuthenticationService({
  authClient: legacyNeteaseAuthClient,
  authRepository: legacyAuthRepository,
  recommender,
  queue,
  scheduler,
  planner: {
    generatePlan: generateInitialPlan,
  },
  eventPublisher: new SocketEventPublisher(io),
});

const musicSource = legacyNeteaseMusicSourceAdapter;

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
  const profile = legacyListenerProfileRepository.get();
  res.json({
    topArtists: (profile.topArtists || []).slice(0, 10),
    topGenres: (profile.analysis?.topGenres || []),
    totalSongs: profile.analysis?.totalSongs || 0,
    currentMood: getTimeOfDayMood(),
  });
});

// GET /api/weather — current weather
app.get('/api/weather', async (req, res) => {
  try {
    const { getWeather } = await import('./services/weather.js');
    const text = await getWeather();
    res.json({ ok: true, text });
  } catch (e) {
    res.json({ ok: false, text: '', error: e.message });
  }
});

// GET /api/plan/today — current DJ listening plan
app.get('/api/plan/today', async (req, res) => {
  try {
    const { generatePlan, isPlanStale, getPlan } = await import('./services/planner.js');
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

function startNeteaseApi() {
  const neteaseApiDir = path.resolve(__dirname, 'node_modules', 'NeteaseCloudMusicApi');
  neteaseProc = spawn('node', ['app.js'], {
    cwd: neteaseApiDir,
    env: { ...process.env, PORT: '3000' },
    stdio: 'pipe',
  });
  neteaseProc.stdout.on('data', (d) => {
    const msg = d.toString().trim();
    if (msg) console.log('[NeteaseAPI]', msg);
  });
  neteaseProc.stderr.on('data', (d) => {
    console.error('[NeteaseAPI]', d.toString().trim());
  });
  neteaseProc.on('close', (code) => {
    console.log('[NeteaseAPI] Exited with code', code);
    if (code !== 0 && code !== null) {
      setTimeout(() => {
        console.log('[NeteaseAPI] Auto-restarting...');
        startNeteaseApi();
      }, 3000);
    }
  });
}

async function waitForNeteaseApi(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch('http://localhost:3000/login/status');
      if (res.ok) return true;
    } catch {
      // NetEase API may still be booting; keep polling until timeout.
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
    console.log('[NeteaseAPI] Ready on port 3000');
  } else {
    console.log('[NeteaseAPI] WARNING: Not ready after timeout, continuing anyway');
  }

  await initDb();
  setupSocketHandler(io);
  console.log('[Server] Socket handler set up, callbacks wired');

  // Check TTS health — report status with visible banner if degraded
  const ttsHealth = await checkTtsHealth();
  if (!ttsHealth.available) {
    console.warn('');
    console.warn('╔══════════════════════════════════════════╗');
    console.warn('║  WARNING: TTS Service Unavailable        ║');
    console.warn(`║  ${ttsHealth.reason.padEnd(40)}║`);
    console.warn('║  DJ speech will be text-only             ║');
    console.warn('╚══════════════════════════════════════════╝');
    console.warn('');
  } else if (ttsHealth.provider === 'edge') {
    console.warn('');
    console.warn('╔══════════════════════════════════════════╗');
    console.warn('║  NOTICE: Using Edge TTS (fallback)       ║');
    console.warn('║  DashScope unavailable                    ║');
    console.warn('╚══════════════════════════════════════════╝');
    console.warn('');
  }

  // Restore a stored NetEase session without letting this entrypoint call legacy auth directly.
  try {
    const restoredSession = await authenticationService.restoreStoredSession();
    const preview = restoredSession.cookiePreview;
    console.log('[Server] Cookie loaded:', preview ? `YES (${preview.slice(0, 40)}...)` : 'NO');

    if (!restoredSession.cookieFound) {
      console.log('[Server] No NetEase cookie found — login required');
    } else if (!restoredSession.restored) {
      console.log('[Server] Auto-start skipped: no authenticated NetEase profile');
    } else {
      console.log('[Server] NetEase cookie loaded');
      if (restoredSession.planGenerated) {
        console.log('[Server] Initial listening plan generated');
      } else if (restoredSession.planError) {
        console.log('[Server] Initial plan skipped:', restoredSession.planError);
      }
      console.log('[Server] Queue filled:', restoredSession.queueLength, 'songs');
      if (restoredSession.queuePrepared) {
        console.log('[Server] Queue prepared, awaiting first client for cold start. Current:', restoredSession.currentSongTitle);
      } else {
        console.log('[Server] Queue still empty after fillQueue');
      }
    }
  } catch (e) {
    console.log('[Server] Auto-start skipped:', e.message);
  }

  httpServer.listen(config.port, () => {
    console.log(`

╔══════════════════════════════════════╗
║        🦀   Qclaudio is ON AIR        ║
║       http://localhost:${config.port}          ║
╚══════════════════════════════════════╝
    `);
  });
}

start();
