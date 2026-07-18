/**
 * HTTP route registration — all REST endpoints extracted from server.js.
 *
 * @param {Express} app — Express application instance
 * @param {Object} services — injected service dependencies
 */
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function registerHttpRoutes(app, services) {
  const {
    healthChecker,
    metricsCollector,
    authenticationService,
    musicSource,
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
    profileSystem,
    config,
    radioEmitter,
    readiness,
    readinessChecker,
  } = services;

  // ─── Observability ──────────────────────────────────────
  // M1: use readinessChecker for real dependency checking if available
  app.get('/health/ready', (_req, res) => {
    res.json(readinessChecker ? readinessChecker() : readiness);
  });

  app.get('/health', async (req, res) => {
    const result = await healthChecker.check();
    const statusCode = result.status === 'ok' ? 200 : result.status === 'degraded' ? 200 : 503;
    res.status(statusCode).json(result);
  });

  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', metricsCollector.registry.contentType);
    res.end(await metricsCollector.metricsText());
  });

  app.get('/api/metrics/json', async (req, res) => {
    res.json(await metricsCollector.metricsJSON());
  });

  app.get('/dashboard', (req, res) => {
    res.sendFile(path.resolve(__dirname, '..', '..', 'dashboard', 'index.html'));
  });

  app.get('/dashboard/profile', (req, res) => {
    res.sendFile(path.resolve(__dirname, '..', '..', 'dashboard', 'profile-panel.html'));
  });

  // ─── Auth ───────────────────────────────────────────────
  app.get('/api/auth/status', async (req, res) => {
    res.json(await authenticationService.currentStatus());
  });

  // ─── Playlists ──────────────────────────────────────────
  app.get('/api/playlists', async (req, res) => {
    try {
      const uid = recommender.uid;
      if (!uid) return res.json({ playlists: [] });
      const playlists = (await musicSource.userPlaylists(uid)).map(p => ({
        id: p.id, name: p.name, trackCount: p.trackCount,
        playCount: p.playCount, coverImgUrl: p.coverImgUrl,
      }));
      res.json({ playlists });
    } catch (e) {
      res.json({ playlists: [], error: e.message });
    }
  });

  app.get('/api/playlist/:id/tracks', async (req, res) => {
    try {
      const tracks = await musicSource.playlistTracks(req.params.id);
      res.json({ tracks });
    } catch (e) {
      res.json({ tracks: [], error: e.message });
    }
  });

  app.post('/api/playlist/:id/play', async (req, res) => {
    try {
      const tracks = await musicSource.playlistTracks(req.params.id);
      if (tracks.length > 0) {
        queue.clear();
        queue.addSongs(tracks);
        radioEmitter?.emitQueueUpdate({ upcomingSongs: queue.upcomingSongs });
        await scheduler.startWithQueue();
        radioEmitter?.emitRadioState(scheduler.getState());
        res.json({ ok: true, count: tracks.length });
      } else {
        res.json({ ok: false, error: 'No tracks found' });
      }
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  // ─── Playback ──────────────────────────────────────────
  app.get('/api/now', (req, res) => {
    res.json(scheduler.getState());
  });

  app.get('/api/next', (req, res) => {
    const next = queue.peek();
    res.json({ nextSong: next || null, queueLength: queue.length });
  });

  app.get('/api/lyric/:id', async (req, res) => {
    try {
      const lyric = await musicSource.lyric(req.params.id);
      res.json({ lrc: lyric?.lrc || '', tlrc: lyric?.tlrc || '' });
    } catch (e) {
      res.json({ lrc: '', tlrc: '', error: e.message });
    }
  });

  // ─── Profile & Taste ───────────────────────────────────
  app.get('/api/taste', (req, res) => {
    const profile = listenerProfileRepository.get();
    res.json({
      topArtists: (profile.topArtists || []).slice(0, 10),
      topGenres: (profile.analysis?.topGenres || []),
      totalSongs: profile.analysis?.totalSongs || 0,
      currentMood: getTimeOfDayMood(),
    });
  });

  app.get('/api/profile', async (req, res) => {
    try {
      if (!profileSystem) {
        return res.json({ ok: false, error: 'Profile system not initialized', profile: null });
      }
      const snapshots = profileSystem.getSnapshots ? profileSystem.getSnapshots(1) : [];
      const cluster = profileSystem.getCurrentCluster ? profileSystem.getCurrentCluster() : null;
      const profile = snapshots[0] || (await profileSystem.getCurrentProfile?.()) || null;
      res.json({ ok: true, profile, cluster, snapshotCount: snapshots.length });
    } catch (e) {
      res.json({ ok: false, error: e.message, profile: null });
    }
  });

  // ─── Weather ───────────────────────────────────────────
  app.get('/api/weather', async (req, res) => {
    try {
      const text = await getWeather();
      res.json({ ok: true, text });
    } catch (e) {
      res.json({ ok: false, text: '', error: e.message });
    }
  });

  // ─── Plan ──────────────────────────────────────────────
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

  // ─── TTS ───────────────────────────────────────────────
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

  // Serve client dist
  const clientDist = path.resolve(__dirname, '..', '..', '..', 'client', 'dist');
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
}
