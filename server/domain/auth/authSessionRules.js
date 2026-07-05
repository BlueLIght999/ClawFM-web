const QR_LOGIN_URL_PREFIX = 'https://music.163.com/login?codekey=';

const QR_STATUS_BY_CODE = new Map([
  [800, { status: 'expired', terminal: true }],
  [801, { status: 'waiting-scan', terminal: false }],
  [802, { status: 'scanned', terminal: false }],
  [803, { status: 'success', terminal: true }],
]);

function authDataFromResult(result) {
  return result?.data || result || {};
}

/**
 * Pick the user profile shape exposed by NetEase login/status responses.
 *
 * @param {object} result NetEase login/status response.
 * @returns {object|null} Prefer profile, then account, or null when absent.
 * @throws Does not throw; malformed input is treated as missing profile.
 * Constraint: preserves the legacy socket payload that sends raw profile/account data.
 */
export function authProfileFromResult(result) {
  const data = authDataFromResult(result);
  return data.profile || data.account || null;
}

/**
 * Extract the listener id used to initialize recommendations after login.
 *
 * @param {object} result NetEase login/status response.
 * @returns {string} Stable string id, or empty string when unavailable.
 * @throws Does not throw.
 * Constraint: profile.userId has priority over account.id to match existing handler behavior.
 */
export function authUserIdFromResult(result) {
  const data = authDataFromResult(result);
  return String(data.profile?.userId || data.account?.id || '');
}

/**
 * Normalize NetEase login/status responses into an application session summary.
 *
 * @param {object} result NetEase login/status response, flat or nested under data.
 * @returns {{loggedIn: boolean, profile: object|null, uid: string}} Stable auth status.
 * @throws Does not throw; malformed input is treated as logged out.
 * Constraint: anonymous NetEase accounts are not considered usable listener sessions.
 */
export function authLoginStatusFromResult(result) {
  const data = authDataFromResult(result);
  const profile = data.profile || null;
  const account = data.account || null;
  const publicProfile = profile || account || null;
  const isAnonymous = account?.anonimousUser === true;
  const loggedIn = !!profile && !isAnonymous;

  return {
    loggedIn,
    profile: publicProfile,
    uid: isAnonymous ? '' : authUserIdFromResult(data),
  };
}

function qrKeyFromResult(result) {
  return result?.unikey || result?.data?.unikey || result?.body?.data?.unikey || '';
}

function qrImageFromResult(result) {
  return result?.qrimg || result?.data?.qrimg || result?.body?.data?.qrimg || null;
}

/**
 * Build the socket-compatible QR creation payload from flat or nested NetEase responses.
 *
 * @param {object} result NetEase QR create response.
 * @returns {{key: string, qrUrl: string, qrimg: string|null}} Stable QR payload.
 * @throws Does not throw; missing key becomes an empty codekey URL.
 * Constraint: keeps the public auth:qr-created payload fields unchanged.
 */
export function qrCreatedPayload(result) {
  const key = qrKeyFromResult(result);
  return {
    key,
    qrUrl: `${QR_LOGIN_URL_PREFIX}${key}`,
    qrimg: qrImageFromResult(result),
  };
}

/**
 * Convert NetEase QR polling code to semantic auth status.
 *
 * @param {number|string} code NetEase QR check code.
 * @returns {{status: string, terminal: boolean}} Status plus whether polling should stop.
 * @throws Does not throw.
 * Constraint: centralizes 800/801/802/803 magic numbers outside the socket handler.
 */
export function qrStatusFromCode(code) {
  return QR_STATUS_BY_CODE.get(Number(code)) || { status: 'unknown', terminal: false };
}
