/**
 * CookieCipherPort — 成员 cookie 加解密 Port（application 层）。
 * 实现见 infrastructure/netease/CookieCipher.js（createCookieCipher，密钥在 bootstrap 注入）。
 * application 层只调 encrypt/decrypt，不接触密钥与 node crypto（守 D3/D4 + RC6）。
 *
 * @typedef {object} CookieCipherPort
 * @property {(cookie: string) => string} encrypt   - 明文 cookie → "v1:iv:tag:ct"
 * @property {(serialized: string) => string} decrypt - "v1:iv:tag:ct" → 明文 cookie
 */

export {};
