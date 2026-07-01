import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import config from './config.js';
import { initDb } from './db/schema.js';
import { getCookie } from './services/netease.js';
import { setupSocketHandler } from './socket/handler.js';
import { recommender } from './services/recommender.js';
import { queue } from './services/queue.js';
import { scheduler } from './services/scheduler.js';
import { getUserProfile } from './db/history.js';
import { getTimeOfDayMood } from './services/context.js';
import { checkTtsHealth, getTtsStatus } from './services/tts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: ['http://localhost:5173', 'http://localhost:3333'], methods: ['GET', 'POST'] },
});

app.use(cors());
app.use(express.json());

// Auth status endpoint
app.get('/api/auth/status', async (req, res) => {
  try {
    const { checkLoginStatus } = await import('./services/netease.js');
    const status = await checkLoginStatus();
    // Normalize: status may have {profile, account} at top level or inside {data: {profile, account}}
    const profile = status.profile || status.data?.profile || null;
    const account = status.account || status.data?.account || null;
    // Anonymous users have account but no profile — require a real profile
    const isAnonymous = account?.anonimousUser === true;
    const loggedIn = !!profile && !isAnonymous;
    res.json({ loggedIn, profile: profile || account });
  } catch (e) {
    res.json({ loggedIn: false, error: e.message });
  }
});

// GET /api/playlists — user playlists
app.get('/api/playlists', async (req, res) => {
  try {
    const { getUserPlaylists } = await import('./services/netease.js');
    const uid = recommender.uid;
    if (!uid) return res.json({ playlists: [] });
    const result = await getUserPlaylists(uid);
    const playlists = (result.playlist || []).map(p => ({
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
    const { getPlaylistTracks } = await import('./services/netease.js');
    const result = await getPlaylistTracks(req.params.id);
    const tracks = (result.songs || result.playlist?.tracks || result.body?.songs || [])
      .map(t => (typeof t === 'object' ? t : null)).filter(Boolean);
    res.json({ tracks });
  } catch (e) {
    res.json({ tracks: [], error: e.message });
  }
});

// POST /api/playlist/:id/play — queue entire playlist
app.post('/api/playlist/:id/play', async (req, res) => {
  try {
    const { getPlaylistTracks } = await import('./services/netease.js');
    const result = await getPlaylistTracks(req.params.id);
    const tracks = (result.songs || result.playlist?.tracks || result.body?.songs || [])
      .map(t => (typeof t === 'object' ? t : null)).filter(Boolean);
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
    const { getLyric } = await import('./services/netease.js');
    const result = await getLyric(req.params.id);
    const lrc = result?.lrc?.lyric || result?.data?.lrc?.lyric || '';
    const tlrc = result?.tlyric?.lyric || result?.data?.tlyric?.lyric || '';
    res.json({ lrc, tlrc });
  } catch (e) {
    res.json({ lrc: '', tlrc: '', error: e.message });
  }
});

// GET /api/taste — user taste profile
app.get('/api/taste', (req, res) => {
  const profile = getUserProfile();
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
    let cached = getPlan();
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
    } catch {}
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

  // Load initial cookie and auto-start if logged in
  const cookie = getCookie();
  console.log('[Server] Cookie loaded:', cookie ? 'YES (' + cookie.slice(0, 40) + '...)' : 'NO');
  if (cookie) {
    console.log('[Server] NetEase cookie loaded');
    try {
      const { checkLoginStatus } = await import('./services/netease.js');
      const status = await checkLoginStatus();
      // Normalize: API response nests under .data
      const data = status.data || status;
      const profile = data.profile || data.account;
      const uid = String(profile?.userId || data.account?.id || '');
      if (uid) {
        await recommender.init(uid);

        // Generate initial listening plan first so fillQueue can use its hints
        let plan = null;
        try {
          const { generatePlan: genPlan } = await import('./services/planner.js');
          plan = await genPlan();
          io.emit('plan:update', plan);
          console.log('[Server] Initial listening plan generated');
        } catch (e) {
          console.log('[Server] Initial plan skipped:', e.message);
        }

        if (plan?.blocks) recommender.setPlanBlocks(plan.blocks);
        await recommender.fillQueue(15, plan?.blocks || null);
        console.log('[Server] Queue filled:', queue.length, 'songs');
        if (!queue.isEmpty) {
          scheduler.prepareQueue();
          console.log('[Server] Queue prepared, awaiting first client for cold start. Current:', queue.current?.name || queue.current?.title);
        } else {
          console.log('[Server] Queue still empty after fillQueue');
        }
      }
    } catch (e) {
      console.log('[Server] Auto-start skipped:', e.message);
    }
  } else {
    console.log('[Server] No NetEase cookie found — login required');
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
