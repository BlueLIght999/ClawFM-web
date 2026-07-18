import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config
vi.mock('../config.js', () => ({
  default: { netease: { apiPort: 4001 } },
}));

// Mock auth repository
const mockCurrentCookie = vi.fn(() => '');
const mockSaveSession = vi.fn();
vi.mock('../infrastructure/persistence/repositories/LegacyAuthRepository.js', () => ({
  legacyAuthRepository: {
    currentCookie: mockCurrentCookie,
    saveSession: mockSaveSession,
  },
}));

const neteaseApi = await import('../infrastructure/netease/neteaseApi.js');

function jsonResponse(body, extra = {}) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: (h) => h === 'content-type' ? 'application/json' : null },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    ...extra,
  };
}

function htmlResponse() {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: (h) => h === 'content-type' ? 'text/html' : null },
    json: () => Promise.reject(new Error('not JSON')),
    text: () => Promise.resolve('<html><body>Port in use</body></html>'),
  };
}

function errorResponse(status, statusText = 'Error') {
  return {
    ok: false,
    status,
    statusText,
    headers: { get: () => null },
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
  };
}

describe('neteaseApi — callApi core behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentCookie.mockReturnValue('');
    neteaseApi.setCookie('');
    global.fetch = vi.fn();
  });

  it('returnsParsedBody_onSuccess', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ code: 200, data: [{ id: '1' }] }));
    const result = await neteaseApi.getSongDetail('1');
    expect(result.code).toBe(200);
    expect(result.data).toHaveLength(1);
  });

  it('throwsWithStatus_onHttpError', async () => {
    global.fetch = vi.fn().mockResolvedValue(errorResponse(500, 'Internal Server Error'));
    await expect(neteaseApi.getSongDetail('1')).rejects.toThrow('HTTP 500');
  });

  it('throwsWithContentType_onNonJsonResponse', async () => {
    global.fetch = vi.fn().mockResolvedValue(htmlResponse());
    await expect(neteaseApi.getSongDetail('1')).rejects.toThrow('non-JSON response');
  });

  it('throwsWithTimeout_onAbortError', async () => {
    global.fetch = vi.fn().mockImplementation((_url, _opts) => {
      return new Promise((_, reject) => {
        setTimeout(() => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        }, 10);
      });
    });
    await expect(neteaseApi.getSongDetail('1')).rejects.toThrow('timed out');
  });

  it('updatesCookie_fromResponseBody', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ code: 200, cookie: 'new-cookie-123' }));
    await neteaseApi.getSongDetail('1');
    expect(neteaseApi.getCookie()).toBe('new-cookie-123');
    expect(mockSaveSession).toHaveBeenCalledWith('new-cookie-123', expect.any(Object));
  });

  it('sendsCookieHeader_whenCookieSet', async () => {
    neteaseApi.setCookie('my-cookie');
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ code: 200 }));
    await neteaseApi.getSongDetail('1');
    const fetchCall = global.fetch.mock.calls[0];
    const headers = fetchCall[1]?.headers;
    expect(headers?.Cookie).toBe('my-cookie');
  });
});

describe('neteaseApi — 301 login expired refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentCookie.mockReturnValue('');
    neteaseApi.setCookie('expired-cookie');
    global.fetch = vi.fn();
  });

  it('refreshesAndRetries_on301', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 301 }))  // first call: expired
      .mockResolvedValueOnce(jsonResponse({ cookie: 'refreshed-cookie' }))  // refresh
      .mockResolvedValueOnce(jsonResponse({ code: 200, data: [] }));  // retry

    const result = await neteaseApi.getSongDetail('1');
    expect(result.code).toBe(200);
    expect(neteaseApi.getCookie()).toBe('refreshed-cookie');
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('throwsReLogin_whenRefreshHasNoCookie', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 301 }))
      .mockResolvedValueOnce(jsonResponse({ code: 200 }));  // no cookie in refresh

    await expect(neteaseApi.getSongDetail('1')).rejects.toThrow('please re-login');
  });

  it('throwsReLogin_whenRetryStill301', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 301 }))
      .mockResolvedValueOnce(jsonResponse({ cookie: 'refreshed' }))
      .mockResolvedValueOnce(jsonResponse({ code: 301 }));  // retry still expired

    await expect(neteaseApi.getSongDetail('1')).rejects.toThrow('please re-login');
  });

  it('throws_whenRefreshHttpFails', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 301 }))
      .mockResolvedValueOnce(errorResponse(500));

    await expect(neteaseApi.getSongDetail('1')).rejects.toThrow('refresh HTTP 500');
  });
});

describe('neteaseApi — phoneLogin', () => {
  beforeEach(() => {
    mockCurrentCookie.mockReturnValue('');
    neteaseApi.setCookie('');
    vi.clearAllMocks(); // Clear AFTER setCookie to avoid false positive
  });

  it('savesCookieAndUserInfo_onSuccess', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({
      code: 200,
      cookie: 'login-cookie',
      account: { id: 42 },
      profile: { userId: 42, nickname: 'Test', avatarUrl: 'http://pic.jpg' },
    }));

    await neteaseApi.phoneLogin('13800138000', 'pass');
    expect(neteaseApi.getCookie()).toBe('login-cookie');
    expect(mockSaveSession).toHaveBeenCalledWith('login-cookie', {
      userId: '42',
      nickname: 'Test',
      avatarUrl: 'http://pic.jpg',
    });
  });

  it('doesNotSaveCookie_whenNoCookieInResponse', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ code: 200 }));
    await neteaseApi.phoneLogin('13800138000', 'pass');
    expect(mockSaveSession).not.toHaveBeenCalled();
  });
});

describe('neteaseApi — getSongUrl quality fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentCookie.mockReturnValue('');
    neteaseApi.setCookie('');
  });

  it('triesMultipleQualities_untilUrlFound', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: [] }))  // exhigh: no url
      .mockResolvedValueOnce(jsonResponse({ data: [] }))  // lossless: no url
      .mockResolvedValueOnce(jsonResponse({ data: [{ url: 'http://mp3.com/song.mp3' }] }));  // hires: found

    const result = await neteaseApi.getSongUrl('123');
    expect(result.data[0].url).toBe('http://mp3.com/song.mp3');
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('fallsBackToStandard_whenAllQualitiesEmpty', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ url: 'http://mp3.com/std.mp3' }] }));

    const result = await neteaseApi.getSongUrl('123');
    expect(result.data[0].url).toBe('http://mp3.com/std.mp3');
  });
});

describe('neteaseApi — scrobbleSong degraded mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentCookie.mockReturnValue('');
    neteaseApi.setCookie('');
  });

  it('swallowsErrors_doesNotThrow', async () => {
    global.fetch = vi.fn().mockResolvedValue(errorResponse(500));
    // Should not throw — scrobble is fire-and-forget
    await expect(neteaseApi.scrobbleSong('123')).resolves.toBeUndefined();
  });

  it('returnsResult_onSuccess', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ code: 200 }));
    const result = await neteaseApi.scrobbleSong('123');
    expect(result.code).toBe(200);
  });
});

describe('neteaseApi — checkLoginStatus normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentCookie.mockReturnValue('');
    neteaseApi.setCookie('');
  });

  it('normalizesNestedData', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({
      data: { profile: { nickname: 'DJ' }, account: { id: 1 }, code: 200 },
    }));
    const result = await neteaseApi.checkLoginStatus();
    expect(result.profile.nickname).toBe('DJ');
    expect(result.account.id).toBe(1);
    expect(result.code).toBe(200);
  });

  it('normalizesFlatData', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({
      profile: { nickname: 'DJ2' },
      code: 200,
    }));
    const result = await neteaseApi.checkLoginStatus();
    expect(result.profile.nickname).toBe('DJ2');
    expect(result.code).toBe(200);
  });

  it('returnsNullProfile_whenNotLoggedIn', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ code: 200 }));
    const result = await neteaseApi.checkLoginStatus();
    expect(result.profile).toBeNull();
    expect(result.account).toBeNull();
  });
});

describe('neteaseApi — searchPlaylists and searchArtists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentCookie.mockReturnValue('');
    neteaseApi.setCookie('');
  });

  it('searchPlaylists_usesType1000', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ code: 200, playlists: [] }));
    await neteaseApi.searchPlaylists('jazz');
    const url = global.fetch.mock.calls[0][0];
    expect(url).toContain('type=1000');
  });

  it('searchArtists_usesType100', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ code: 200, artists: [] }));
    await neteaseApi.searchArtists('jazz');
    const url = global.fetch.mock.calls[0][0];
    expect(url).toContain('type=100');
  });
});

describe('neteaseApi — setAuthRepository', () => {
  it('resetsCachedCookie', () => {
    neteaseApi.setCookie('old-cookie');
    expect(neteaseApi.getCookie()).toBe('old-cookie');
    const mockRepo = { currentCookie: () => 'repo-cookie', saveSession: vi.fn() };
    neteaseApi.setAuthRepository(mockRepo);
    expect(neteaseApi.getCookie()).toBe('repo-cookie');
  });
});
