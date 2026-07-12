import {
  phoneLogin,
  createQrLogin,
  checkQrLogin,
  checkLoginStatus,
} from '../netease/neteaseApi.js';

/**
 * Adapter for legacy NetEase auth functions used by AuthenticationService.
 */
export const legacyNeteaseAuthClient = {
  /**
   * Login through the legacy NetEase phone endpoint.
   *
   * @param {string} phone Listener phone number.
   * @param {string} password Listener password.
   * @returns {Promise<object>} Raw NetEase login result.
   * @throws Bubbles legacy API failures.
   * Constraint: keeps cookie persistence inside legacy netease.js/AuthRepository for now.
   */
  phoneLogin(phone, password) {
    return phoneLogin(phone, password);
  },

  /**
   * Create a QR login key/image through the legacy NetEase endpoint.
   *
   * @returns {Promise<object>} Raw NetEase QR creation result.
   * @throws Bubbles legacy API failures.
   * Constraint: payload normalization happens in AuthenticationService/domain rules.
   */
  createQrLogin() {
    return createQrLogin();
  },

  /**
   * Poll NetEase QR login status.
   *
   * @param {string} key QR login key.
   * @returns {Promise<object>} Raw NetEase QR check result.
   * @throws Bubbles transient API failures; handler polling may ignore them.
   * Constraint: does not decide socket events.
   */
  checkQrLogin(key) {
    return checkQrLogin(key);
  },

  /**
   * Read current NetEase login status after QR success.
   *
   * @returns {Promise<object>} Normalized legacy status with profile/account.
   * @throws Bubbles legacy API failures.
   * Constraint: session initialization is handled by AuthenticationService.
   */
  checkLoginStatus() {
    return checkLoginStatus();
  },
};
