/**
 * QR Login Handler — extracted from handler.js for single-responsibility.
 * Handles QR code creation with retry and polling lifecycle.
 */
import { EVENTS } from './events.js';
import { ERROR_CODES } from '../domain/errors/error-codes.js';

const QR_MAX_CREATE_RETRIES = 2;
const QR_POLL_INTERVAL_MS = 2000;
const QR_MAX_POLL_FAILURES = 3;

/**
 * Wire QR login event handler on a socket.
 * @param {import('socket.io').Socket} socket
 * @param {import('../application/services/AuthenticationService.js').AuthenticationService} authenticationService
 * @param {(socket, result) => void} emitAuthenticationResult
 */
export function wireQrLoginHandler(socket, authenticationService, emitAuthenticationResult) {
  socket.on(EVENTS.AUTH_LOGIN_QR_START, async () => {
    try {
      const qrResult = await createQrWithRetry(authenticationService);
      emitAuthenticationResult(socket, qrResult);
      startQrPolling(socket, authenticationService, qrResult.qrCreated.key, emitAuthenticationResult);
    } catch (e) {
      socket.emit(EVENTS.ERROR, { code: ERROR_CODES.AUTH_QR_CREATE_FAILED, message: e.message });
    }
  });
}

async function createQrWithRetry(authenticationService) {
  let lastError = null;
  for (let attempt = 1; attempt <= QR_MAX_CREATE_RETRIES; attempt++) {
    try {
      return await authenticationService.createQrLogin();
    } catch (e) {
      lastError = e;
      if (attempt < QR_MAX_CREATE_RETRIES) await new Promise(r => setTimeout(r, 500 * attempt));
    }
  }
  throw lastError;
}

function startQrPolling(socket, authenticationService, key, emitAuthenticationResult) {
  if (socket._qrPollInterval) clearInterval(socket._qrPollInterval);
  let pollFailures = 0;

  socket._qrPollInterval = setInterval(async () => {
    try {
      const result = await authenticationService.checkQrLogin(key);
      pollFailures = 0;
      emitAuthenticationResult(socket, result);
      if (result.done) {
        clearInterval(socket._qrPollInterval);
        socket._qrPollInterval = null;
      }
    } catch (e) {
      pollFailures++;
      if (pollFailures >= QR_MAX_POLL_FAILURES) {
        socket.emit(EVENTS.ERROR, {
          code: ERROR_CODES.AUTH_QR_POLL_FAILED,
          message: `QR polling failed: ${e.message}. Please retry.`,
        });
        clearInterval(socket._qrPollInterval);
        socket._qrPollInterval = null;
      }
    }
  }, QR_POLL_INTERVAL_MS);
}
