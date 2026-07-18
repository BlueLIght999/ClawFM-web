import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted so mock fns are available when hoisted vi.mock factories run
const { mockEdgeSynthesize } = vi.hoisted(() => ({
  mockEdgeSynthesize: vi.fn(),
}));

vi.mock('../../config.js', () => ({
  default: {
    dashscopeApiKey: 'test-key',
    tts: { outputDir: '/tmp/tts-test' },
  },
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

vi.mock('@travisvn/edge-tts', () => ({
  EdgeTTS: class MockEdgeTTS {
    constructor() {}
    synthesize() { return mockEdgeSynthesize(); }
  },
}));

vi.mock('../../domain/hosting/cleanTtsText.js', () => ({
  cleanTtsText: vi.fn((text) => text?.trim() || ''),
}));

const { generateSpeech, checkTtsHealth, isTtsAvailable, getTtsStatus, isConfigured } =
  await import('../infrastructure/speech/ttsService.js');

// Helper: set up DashScope success response
function dashscopeOk(url = 'http://oss/audio.mp3') {
  return {
    ok: true,
    json: () => Promise.resolve({ output: { audio: { url } } }),
    text: () => Promise.resolve(''),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
  };
}

// Helper: set up DashScope failure response
function dashscopeFail() {
  return { ok: false, text: () => Promise.resolve('error') };
}

// Helper: Edge TTS success result
function edgeOk() {
  return {
    audio: { arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)) },
  };
}

// Helper: make health check pass with DashScope
async function primeDashscopeHealth() {
  global.fetch = vi.fn().mockResolvedValue(dashscopeOk());
  mockEdgeSynthesize.mockResolvedValue(edgeOk());
  await checkTtsHealth();
}

describe('ttsService — generateSpeech', () => {
  beforeEach(() => {
    mockEdgeSynthesize.mockReset();
    mockEdgeSynthesize.mockResolvedValue(edgeOk());
  });

  it('returnsNull_forEmptyText', async () => {
    expect(await generateSpeech('')).toBeNull();
  });

  it('returnsNull_forWhitespaceOnlyText', async () => {
    expect(await generateSpeech('   ')).toBeNull();
  });

  it('returnsNull_forNullText', async () => {
    expect(await generateSpeech(null)).toBeNull();
  });

  it('shortCircuits_whenTtsKnownUnavailable', async () => {
    global.fetch = vi.fn().mockResolvedValue(dashscopeFail());
    mockEdgeSynthesize.mockRejectedValue(new Error('edge down'));
    await checkTtsHealth();
    expect(isTtsAvailable()).toBe(false);

    global.fetch = vi.fn();
    const result = await generateSpeech('hello');
    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('triesDashScopeFirst_whenApiKeyConfigured', async () => {
    await primeDashscopeHealth();

    global.fetch = vi.fn()
      .mockResolvedValueOnce(dashscopeOk('http://oss/test.mp3'))
      .mockResolvedValueOnce({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)) });

    const result = await generateSpeech('test text');
    expect(result).toMatch(/^\/audio\/tts\/tts_ds_/);
  });

  it('fallsBackToEdgeTts_whenDashScopeFails', async () => {
    await primeDashscopeHealth();

    global.fetch = vi.fn().mockResolvedValue(dashscopeFail());
    mockEdgeSynthesize.mockResolvedValue(edgeOk());

    const result = await generateSpeech('fallback test');
    expect(result).toMatch(/^\/audio\/tts\/tts_e_/);
  });

  it('returnsNull_whenBothProvidersFail', async () => {
    await primeDashscopeHealth();

    global.fetch = vi.fn().mockResolvedValue(dashscopeFail());
    mockEdgeSynthesize.mockRejectedValue(new Error('edge down'));

    const result = await generateSpeech('doomed');
    expect(result).toBeNull();
    expect(isTtsAvailable()).toBe(false);
  });

  it('usesCache_forRepeatedCalls', async () => {
    await primeDashscopeHealth();

    global.fetch = vi.fn()
      .mockResolvedValueOnce(dashscopeOk('http://oss/cached.mp3'))
      .mockResolvedValueOnce({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)) });

    const result1 = await generateSpeech('cached text');
    expect(result1).toBeTruthy();

    global.fetch = vi.fn();
    const result2 = await generateSpeech('cached text');
    expect(result2).toBe(result1);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('ttsService — checkTtsHealth', () => {
  beforeEach(() => {
    mockEdgeSynthesize.mockReset();
    mockEdgeSynthesize.mockResolvedValue(edgeOk());
  });

  it('setsDashscopeProvider_whenDashscopePasses', async () => {
    global.fetch = vi.fn().mockResolvedValue(dashscopeOk());

    await checkTtsHealth();
    const status = getTtsStatus();
    expect(status.checked).toBe(true);
    expect(status.available).toBe(true);
    expect(status.provider).toBe('dashscope');
  });

  it('fallsBackToEdge_whenDashscopeFails', async () => {
    global.fetch = vi.fn().mockResolvedValue(dashscopeFail());
    mockEdgeSynthesize.mockResolvedValue(edgeOk());

    await checkTtsHealth();
    const status = getTtsStatus();
    expect(status.checked).toBe(true);
    expect(status.available).toBe(true);
    expect(status.provider).toBe('edge');
  });

  it('setsUnavailable_whenBothProvidersFail', async () => {
    global.fetch = vi.fn().mockResolvedValue(dashscopeFail());
    mockEdgeSynthesize.mockRejectedValue(new Error('edge down'));

    await checkTtsHealth();
    const status = getTtsStatus();
    expect(status.checked).toBe(true);
    expect(status.available).toBe(false);
    expect(status.provider).toBeNull();
    expect(status.reason).toContain('unavailable');
  });
});

describe('ttsService — isTtsAvailable', () => {
  it('returnsBooleanOrNull', () => {
    expect([true, false, null]).toContain(isTtsAvailable());
  });
});

describe('ttsService — getTtsStatus', () => {
  it('returnsCopy_notReference', async () => {
    global.fetch = vi.fn().mockResolvedValue(dashscopeOk());
    mockEdgeSynthesize.mockRejectedValue(new Error('skip'));
    await checkTtsHealth();

    const s1 = getTtsStatus();
    const s2 = getTtsStatus();
    expect(s1).not.toBe(s2);
    expect(s1).toEqual(s2);
  });
});

describe('ttsService — isConfigured', () => {
  it('returnsTrue_becauseEdgeAlwaysAvailable', () => {
    // Bug: `config.dashscopeApiKey || true` always returns true
    expect(isConfigured()).toBe(true);
  });
});
