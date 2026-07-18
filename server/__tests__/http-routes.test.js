import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerHttpRoutes } from '../infrastructure/http/httpRoutes.js';

function createTestApp(services) {
  const app = express();
  app.use(express.json());
  registerHttpRoutes(app, services);
  return app;
}

const defaultServices = {
  healthChecker: { check: vi.fn().mockResolvedValue({ status: 'ok' }) },
  metricsCollector: {
    registry: { contentType: 'text/plain' },
    metricsText: vi.fn().mockResolvedValue('# metrics'),
    metricsJSON: vi.fn().mockResolvedValue({}),
  },
  authenticationService: { currentStatus: vi.fn().mockResolvedValue({ loggedIn: false }) },
  musicSource: {
    userPlaylists: vi.fn().mockResolvedValue([]),
    playlistTracks: vi.fn().mockResolvedValue([]),
    lyric: vi.fn().mockResolvedValue({ lrc: '', tlrc: '' }),
  },
  recommender: { uid: null },
  queue: {
    clear: vi.fn(),
    addSongs: vi.fn(),
    upcomingSongs: [],
    peek: vi.fn(() => null),
    length: 0,
    mode: 'normal',
  },
  scheduler: {
    startWithQueue: vi.fn(),
    getState: vi.fn(() => ({ isPlaying: false })),
  },
  listenerProfileRepository: { get: vi.fn(() => ({})) },
  getTimeOfDayMood: vi.fn(() => 'morning'),
  getWeather: vi.fn().mockResolvedValue('Sunny'),
  getPlan: vi.fn(() => null),
  isPlanStale: vi.fn(() => false),
  generatePlan: vi.fn().mockResolvedValue({ blocks: [] }),
  getTtsStatus: vi.fn(() => ({ checked: true, available: true })),
  checkTtsHealth: vi.fn().mockResolvedValue({ available: true }),
  profileSystem: null,
  config: { tts: { outputDir: '/tmp/tts' } },
  readiness: {
    status: 'ready',
    service: 'qclaudio',
    instanceId: 'test-instance',
    version: '1.0.0',
    buildId: 'test-build',
  },
};

describe('HttpRoutes — health & metrics', () => {
  it('GET /health/ready returns stable launcher identity', async () => {
    const app = createTestApp(defaultServices);
    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(defaultServices.readiness);
  });

  it('GET /health returns 200 when ok', async () => {
    const app = createTestApp(defaultServices);
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /health returns 503 when not ok', async () => {
    const services = { ...defaultServices, healthChecker: { check: vi.fn().mockResolvedValue({ status: 'down' }) } };
    const app = createTestApp(services);
    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
  });

  it('GET /metrics returns prometheus text', async () => {
    const app = createTestApp(defaultServices);
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('# metrics');
  });

  it('GET /api/metrics/json returns JSON', async () => {
    const app = createTestApp(defaultServices);
    const res = await request(app).get('/api/metrics/json');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });
});

describe('HttpRoutes — auth & playlists', () => {
  it('GET /api/auth/status returns auth state', async () => {
    const app = createTestApp(defaultServices);
    const res = await request(app).get('/api/auth/status');
    expect(res.status).toBe(200);
    expect(res.body.loggedIn).toBe(false);
  });

  it('GET /api/playlists returns empty when no uid', async () => {
    const app = createTestApp(defaultServices);
    const res = await request(app).get('/api/playlists');
    expect(res.body.playlists).toEqual([]);
  });

  it('GET /api/playlists returns playlists when uid set', async () => {
    const services = {
      ...defaultServices,
      recommender: { uid: '123' },
      musicSource: {
        ...defaultServices.musicSource,
        userPlaylists: vi.fn().mockResolvedValue([{ id: 'p1', name: 'My', trackCount: 10 }]),
      },
    };
    const app = createTestApp(services);
    const res = await request(app).get('/api/playlists');
    expect(res.body.playlists).toHaveLength(1);
    expect(res.body.playlists[0].id).toBe('p1');
  });

  it('POST /api/playlist/:id/play queues and starts', async () => {
    const services = {
      ...defaultServices,
      musicSource: {
        ...defaultServices.musicSource,
        playlistTracks: vi.fn().mockResolvedValue([{ id: 's1' }]),
      },
    };
    const app = createTestApp(services);
    const res = await request(app).post('/api/playlist/p1/play');
    expect(res.body.ok).toBe(true);
    expect(services.queue.clear).toHaveBeenCalled();
    expect(services.queue.addSongs).toHaveBeenCalled();
    expect(services.scheduler.startWithQueue).toHaveBeenCalled();
  });
});

describe('HttpRoutes — now & next', () => {
  it('GET /api/now returns scheduler state', async () => {
    const app = createTestApp(defaultServices);
    const res = await request(app).get('/api/now');
    expect(res.body.isPlaying).toBe(false);
  });

  it('GET /api/next returns next song', async () => {
    const app = createTestApp(defaultServices);
    const res = await request(app).get('/api/next');
    expect(res.body.nextSong).toBeNull();
    expect(res.body.queueLength).toBe(0);
  });
});

describe('HttpRoutes — taste & weather', () => {
  it('GET /api/taste returns profile data', async () => {
    const app = createTestApp(defaultServices);
    const res = await request(app).get('/api/taste');
    expect(res.body.topArtists).toEqual([]);
    expect(res.body.currentMood).toBe('morning');
  });

  it('GET /api/weather returns weather text', async () => {
    const app = createTestApp(defaultServices);
    const res = await request(app).get('/api/weather');
    expect(res.body.ok).toBe(true);
    expect(res.body.text).toBe('Sunny');
  });
});

describe('HttpRoutes — plan & tts', () => {
  it('GET /api/plan/today returns cached plan when not stale', async () => {
    const services = {
      ...defaultServices,
      getPlan: vi.fn(() => ({ plan: { blocks: [{ title: 'cached' }] } })),
      isPlanStale: vi.fn(() => false),
    };
    const app = createTestApp(services);
    const res = await request(app).get('/api/plan/today');
    expect(res.body.blocks[0].title).toBe('cached');
    expect(services.generatePlan).not.toHaveBeenCalled();
  });

  it('GET /api/plan/today?force=true generates new plan', async () => {
    const services = {
      ...defaultServices,
      getPlan: vi.fn(() => ({ plan: { blocks: [] } })),
      generatePlan: vi.fn().mockResolvedValue({ blocks: [{ title: 'fresh' }] }),
    };
    const app = createTestApp(services);
    const res = await request(app).get('/api/plan/today?force=true');
    expect(services.generatePlan).toHaveBeenCalledWith(true);
    expect(res.body.blocks[0].title).toBe('fresh');
  });

  it('GET /api/tts/status returns TTS status', async () => {
    const app = createTestApp(defaultServices);
    const res = await request(app).get('/api/tts/status');
    expect(res.body.available).toBe(true);
  });

  it('GET /api/tts/status triggers health check when not checked', async () => {
    const services = {
      ...defaultServices,
      getTtsStatus: vi.fn(() => ({ checked: false })),
      checkTtsHealth: vi.fn().mockResolvedValue({ available: true, provider: 'edge' }),
    };
    const app = createTestApp(services);
    const res = await request(app).get('/api/tts/status');
    expect(services.checkTtsHealth).toHaveBeenCalled();
    expect(res.body.provider).toBe('edge');
  });
});

describe('HttpRoutes — lyrics', () => {
  it('GET /api/lyric/:id returns lyrics', async () => {
    const services = {
      ...defaultServices,
      musicSource: { ...defaultServices.musicSource, lyric: vi.fn().mockResolvedValue({ lrc: '[00:01]Hello', tlrc: '' }) },
    };
    const app = createTestApp(services);
    const res = await request(app).get('/api/lyric/123');
    expect(res.body.lrc).toBe('[00:01]Hello');
  });

  it('GET /api/lyric/:id handles error gracefully', async () => {
    const services = {
      ...defaultServices,
      musicSource: { ...defaultServices.musicSource, lyric: vi.fn().mockRejectedValue(new Error('fail')) },
    };
    const app = createTestApp(services);
    const res = await request(app).get('/api/lyric/123');
    expect(res.body.lrc).toBe('');
    expect(res.body.error).toBe('fail');
  });
});
