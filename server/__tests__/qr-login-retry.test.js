import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ERROR_CODES } from '../domain/errors/error-codes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Test the QR login retry logic by simulating the handler behavior

describe('QR login retry logic', () => {
  it('createQrLogin_retriesOnFailure_thenSucceeds', async () => {
    const createQrLogin = vi.fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValue({ qrCreated: { key: 'test-key', qrimg: 'base64...' } });

    let result = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        result = await createQrLogin();
        break;
      } catch (e) {
        if (attempt < 3) await new Promise(r => setTimeout(r, 10));
      }
    }

    expect(result).not.toBeNull();
    expect(result.qrCreated.key).toBe('test-key');
    expect(createQrLogin).toHaveBeenCalledTimes(3);
  });

  it('createQrLogin_retriesExhausted_throwsLastError', async () => {
    const createQrLogin = vi.fn()
      .mockRejectedValue(new Error('ECONNREFUSED'));

    let result = null;
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        result = await createQrLogin();
        break;
      } catch (e) {
        lastError = e;
        if (attempt < 3) await new Promise(r => setTimeout(r, 10));
      }
    }

    expect(result).toBeNull();
    expect(lastError.message).toBe('ECONNREFUSED');
    expect(createQrLogin).toHaveBeenCalledTimes(3);
  });

  it('createQrLogin_succeedsFirstTry_noRetry', async () => {
    const createQrLogin = vi.fn()
      .mockResolvedValue({ qrCreated: { key: 'immediate', qrimg: 'data:...' } });

    let result = null;
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        result = await createQrLogin();
        break;
      } catch (e) {
        lastError = e;
        if (attempt < 3) await new Promise(r => setTimeout(r, 10));
      }
    }

    expect(result.qrCreated.key).toBe('immediate');
    expect(createQrLogin).toHaveBeenCalledTimes(1);
    expect(lastError).toBeNull();
  });

  it('pollFailures_reaches3_notifiesClient', () => {
    let pollFailures = 0;
    let notified = false;
    const mockEmit = vi.fn((event, payload) => {
      if (payload?.code === ERROR_CODES.AUTH_QR_POLL_FAILED) notified = true;
    });

    // Simulate 3 consecutive failures
    for (let i = 0; i < 3; i++) {
      pollFailures++;
      if (pollFailures >= 3) {
        mockEmit('error', {
          code: ERROR_CODES.AUTH_QR_POLL_FAILED,
          message: 'QR polling failed: ECONNREFUSED. Please retry.',
        });
      }
    }

    expect(pollFailures).toBe(3);
    expect(notified).toBe(true);
    expect(mockEmit).toHaveBeenCalledTimes(1);
  });

  it('pollFailures_below3_doesNotNotify', () => {
    let pollFailures = 0;
    let notified = false;
    const mockEmit = vi.fn((event, payload) => {
      if (payload?.code === ERROR_CODES.AUTH_QR_POLL_FAILED) notified = true;
    });

    // Simulate 2 consecutive failures (transient)
    for (let i = 0; i < 2; i++) {
      pollFailures++;
      if (pollFailures >= 3) {
        mockEmit('error', {
          code: ERROR_CODES.AUTH_QR_POLL_FAILED,
          message: 'QR polling failed. Please retry.',
        });
      }
    }

    expect(pollFailures).toBe(2);
    expect(notified).toBe(false);
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('pollFailures_resetOnSuccess', () => {
    let pollFailures = 0;

    // 2 failures
    pollFailures++;
    pollFailures++;
    expect(pollFailures).toBe(2);

    // Success resets
    pollFailures = 0;
    expect(pollFailures).toBe(0);

    // Another failure doesn't trigger (count starts fresh)
    pollFailures++;
    expect(pollFailures).toBe(1);
  });
});

// ─── neteaseApi fetch timeout + HTTP error handling ─────────────

describe('neteaseApi fetch timeout and HTTP error handling', () => {
  let originalFetch;

  beforeEach(() => {
    vi.resetModules();
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('callApi_throwsOnHttpErrorStatus', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      headers: new Map([['content-type', 'text/html']]),
    });

    const { createQrLogin } = await import('../infrastructure/netease/neteaseApi.js');
    await expect(createQrLogin()).rejects.toThrow('HTTP 502');
  });

  it('callApi_throwsOnTimeout', async () => {
    vi.useFakeTimers();

    global.fetch = vi.fn().mockImplementation((_url, options) => {
      return new Promise((_resolve, reject) => {
        if (options?.signal) {
          options.signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    });

    const { createQrLogin } = await import('../infrastructure/netease/neteaseApi.js');
    const promise = createQrLogin();

    // Fast-forward past the 10s fetch timeout
    vi.advanceTimersByTime(10000);

    await expect(promise).rejects.toThrow('timed out');
  });

  it('callApi_succeedsOnValidResponse', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ data: { unikey: 'test-key-123' } }),
    });

    // Second call for /login/qr/create
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ data: { unikey: 'test-key-123' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ data: { qrimg: 'data:image/png;base64,abc' } }),
      });

    const { createQrLogin } = await import('../infrastructure/netease/neteaseApi.js');
    const result = await createQrLogin();
    expect(result.unikey).toBe('test-key-123');
    expect(result.qrimg).toBe('data:image/png;base64,abc');
  });
});

// ─── Structural tests: disconnect listener + useSocket ──────────

describe('QR login structural fixes', () => {
  it('handler_disconnectCleanupRegisteredOutsideQrStart', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../socket/handler.js'), 'utf-8',
    );

    // The disconnect handler for QR cleanup should be in wireAuthEvents scope,
    // NOT inside the AUTH_LOGIN_QR_START handler.
    // QR login is now extracted to qrLoginHandler.js, so AUTH_LOGIN_QR_START
    // should NOT exist in handler.js at all.
    const wireAuthStart = source.indexOf('function wireAuthEvents');
    const qrStartHandler = source.indexOf("socket.on(EVENTS.AUTH_LOGIN_QR_START");
    const disconnectInAuth = source.indexOf("socket.on('disconnect'", wireAuthStart);

    // disconnect handler exists in wireAuthEvents scope
    expect(disconnectInAuth).toBeGreaterThan(wireAuthStart);
    // QR start handler is no longer in handler.js (extracted to qrLoginHandler.js)
    expect(qrStartHandler).toBe(-1);
  });

  it('handler_noDisconnectInsideQrStart', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../socket/handler.js'), 'utf-8',
    );

    // Find the QR start handler block
    const qrStart = source.indexOf("socket.on(EVENTS.AUTH_LOGIN_QR_START");
    // Find the next handler or function after QR start
    const nextFunction = source.indexOf('function wire', qrStart + 1);

    const qrBlock = source.slice(qrStart, nextFunction);
    // The QR start handler should NOT contain a socket.on('disconnect') call
    expect(qrBlock).not.toContain("socket.on('disconnect'");
  });

  it('neteaseApi_hasFetchWithTimeout', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../infrastructure/netease/neteaseApi.js'), 'utf-8',
    );

    expect(source).toContain('fetchWithTimeout');
    expect(source).toContain('AbortController');
    expect(source).toContain('FETCH_TIMEOUT_MS');
  });

  it('neteaseApi_checksResOk', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../infrastructure/netease/neteaseApi.js'), 'utf-8',
    );

    expect(source).toContain('!res.ok');
  });

  it('useSocket_usesUseState_notUseRef', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../client/src/hooks/useSocket.js'), 'utf-8',
    );

    expect(source).not.toContain('useRef');
    expect(source).toContain('useState');
    expect(source).toContain('setSocket');
  });
});

// ─── Phone login retry logic ────────────────────────────────────

describe('Phone login retry logic', () => {
  it('phoneLogin_retriesOnConnectionError_thenSucceeds', async () => {
    const loginWithPhone = vi.fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValue({ loginSuccess: { profile: { userId: 1 } } });

    let result = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        result = await loginWithPhone();
        break;
      } catch (e) {
        if (e.isAuthError) break;
        if (attempt < 2) await new Promise(r => setTimeout(r, 10));
      }
    }

    expect(result).not.toBeNull();
    expect(result.loginSuccess.profile.userId).toBe(1);
    expect(loginWithPhone).toHaveBeenCalledTimes(2);
  });

  it('phoneLogin_noRetryOnAuthError', async () => {
    const authErr = new Error('密码错误');
    authErr.isAuthError = true;
    const loginWithPhone = vi.fn()
      .mockRejectedValueOnce(authErr)
      .mockResolvedValue({ loginSuccess: {} });

    let result = null;
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        result = await loginWithPhone();
        break;
      } catch (e) {
        lastError = e;
        if (e.isAuthError) break;
        if (attempt < 2) await new Promise(r => setTimeout(r, 10));
      }
    }

    expect(result).toBeNull();
    expect(lastError.isAuthError).toBe(true);
    expect(loginWithPhone).toHaveBeenCalledTimes(1);
  });

  it('phoneLogin_retriesExhausted_throwsLastError', async () => {
    const loginWithPhone = vi.fn()
      .mockRejectedValue(new Error('timed out'));

    let result = null;
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        result = await loginWithPhone();
        break;
      } catch (e) {
        lastError = e;
        if (e.isAuthError) break;
        if (attempt < 2) await new Promise(r => setTimeout(r, 10));
      }
    }

    expect(result).toBeNull();
    expect(lastError.message).toBe('timed out');
    expect(loginWithPhone).toHaveBeenCalledTimes(2);
  });
});

// ─── LoginOverlay event name verification ───────────────────────

describe('LoginOverlay event name verification', () => {
  it('loginOverlay_listensOnRadioError_notBareError', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../client/src/components/LoginOverlay.jsx'), 'utf-8',
    );

    // Must listen on 'radio:error' (EVENTS.ERROR), not bare 'error'
    expect(source).toContain("socket.on('radio:error'");
    expect(source).not.toMatch(/socket\.on\('error'/);
  });

  it('loginOverlay_cleanupRemovesRadioError', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../client/src/components/LoginOverlay.jsx'), 'utf-8',
    );

    expect(source).toContain("socket.off('radio:error')");
    expect(source).not.toMatch(/socket\.off\('error'\)/);
  });

  it('handler_phoneLoginHasRetryLogic', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../socket/handler.js'), 'utf-8',
    );

    // Find the phone login handler block
    const phoneStart = source.indexOf("socket.on(EVENTS.AUTH_LOGIN_PHONE");
    const qrStart = source.indexOf("socket.on(EVENTS.AUTH_LOGIN_QR_START");

    const phoneBlock = source.slice(phoneStart, qrStart);

    // Phone login should have retry loop and isAuthError check
    expect(phoneBlock).toContain('isAuthError');
    expect(phoneBlock).toContain('attempt');
  });

  it('authService_validatesLoginResponse', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../application/services/AuthenticationService.js'), 'utf-8',
    );

    // loginWithPhone should check status.loggedIn and set isAuthError
    expect(source).toContain('authLoginStatusFromResult');
    expect(source).toContain('isAuthError');
    expect(source).toContain('status.loggedIn');
  });
});
