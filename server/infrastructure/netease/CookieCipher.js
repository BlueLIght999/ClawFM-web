/**
 * CookieCipher — 成员网易云 cookie 的 AES-256-GCM 加解密（infrastructure 层）。
 *
 * RC6 不变量基础：成员 cookie 落库前必须加密；解密仅在服务端拉历史时用。
 * 用 Node 内置 crypto（infrastructure 允许 node 内置，D2 只约束 domain）。
 *
 * 序列化格式："v1:<ivB64>:<tagB64>:<ctB64>"，便于存单列 TEXT。
 */

import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const VERSION = 'v1';

/**
 * 从 passphrase 派生 32 字节密钥（hex 字符串）。
 * 调用方应把 salt 与 passphrase 一起存配置（不在代码里）。
 */
export function deriveKey(passphrase, salt) {
  return crypto.scryptSync(String(passphrase), String(salt), KEY_BYTES).toString('hex');
}

/**
 * 校验密钥是 32 字节（hex 64 字符或 Buffer 32）。
 */
export function toKeyBuffer(key) {
  if (Buffer.isBuffer(key)) {
    if (key.length !== KEY_BYTES) throw new Error(`CookieCipher: key must be ${KEY_BYTES} bytes`);
    return key;
  }
  const buf = Buffer.from(String(key), 'hex');
  if (buf.length !== KEY_BYTES) {
    throw new Error(`CookieCipher: key must be ${KEY_BYTES} bytes (got ${buf.length})`);
  }
  return buf;
}

/**
 * 加密 cookie 明文 → "v1:<iv>:<tag>:<ct>"。
 * 每次随机 iv，因此同一明文每次密文不同。
 */
export function encrypt(cookie, key) {
  const keyBuf = toKeyBuffer(key);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, keyBuf, iv);
  const ct = Buffer.concat([cipher.update(String(cookie), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

/**
 * 解密 "v1:<iv>:<tag>:<ct>" → cookie 明文。密钥不符/被篡改抛错。
 */
export function decrypt(serialized, key) {
  const keyBuf = toKeyBuffer(key);
  const parts = String(serialized).split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('CookieCipher: invalid serialized format');
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGO, keyBuf, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
  return plain.toString('utf8');
}

/**
 * 加解密往返，便于测试与一次性使用。
 */
export function roundTrip(cookie, key) {
  return decrypt(encrypt(cookie, key), key);
}

/**
 * 工厂：用给定密钥构造一个绑定了密钥的 cipher（实现 CookieCipherPort）。
 * application 层通过 CookieCipherPort 调用，不接触密钥；密钥在 bootstrap 注入（来自 env/config）。
 * @returns {{encrypt:(cookie:string)=>string, decrypt:(serialized:string)=>string}}
 */
export function createCookieCipher(key) {
  return {
    encrypt: (cookie) => encrypt(cookie, key),
    decrypt: (serialized) => decrypt(serialized, key),
  };
}
