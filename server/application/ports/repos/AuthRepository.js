/**
 * @typedef {object} AuthSessionProfile
 * @property {string|number=} userId
 * @property {string=} nickname
 * @property {string=} avatarUrl
 *
 * @typedef {object} AuthRepository
 * @property {() => string} currentCookie
 * @property {(cookie: string, profile?: AuthSessionProfile) => void} saveSession
 */

export {};
