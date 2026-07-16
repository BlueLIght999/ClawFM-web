/**
 * Error Codes — 6-digit numeric codes per ERROR-HANDLING.md
 *
 * Format: MMTTNN
 *   MM = module (01=Auth, 02=Playback, 03=Music, 04=Hosting, 05=Curation, 06=Routing, 07=Environment)
 *   TT = type   (01=Param, 02=Business, 03=System, 04=Permission)
 *   NN = sequential number within module+type
 *
 * NOTE: Leading zeros are omitted in JS (strict mode forbids legacy octal).
 * The 6-digit format (e.g. "010402") is used in documentation only.
 */

export const ERROR_CODES = {
  // 01 — Auth
  AUTH_LOGIN_FAILED:      10402,  // doc: 010402 — 鉴权-权限错误-登录失败
  AUTH_QR_POLL_FAILED:    10301,  // doc: 010301 — 鉴权-系统异常-QR轮询失败
  AUTH_QR_CREATE_FAILED:  10303,  // doc: 010303 — 鉴权-系统异常-QR生成失败
  AUTH_COOKIE_EXPIRED:    10401,  // doc: 010401 — 鉴权-权限错误-登录已过期

  // 03 — Music
  MUSIC_API_ERROR:        30301,  // doc: 030301 — 音乐源-系统异常-API调用失败
  MUSIC_NO_URL:           30201,  // doc: 030201 — 音乐源-业务错误-歌曲无可用URL

  // 04 — Hosting
  TTS_UNAVAILABLE:        40301,  // doc: 040301 — DJ-系统异常-TTS双引擎不可用
  LLM_TIMEOUT:            40302,  // doc: 040302 — DJ-系统异常-DeepSeek超时

  // 05 — Curation
  SEED_POOL_EMPTY:        50201,  // doc: 050201 — 推荐-业务错误-种子池为空
};

/**
 * Get a human-readable message for an error code.
 * @param {number} code
 * @returns {string}
 */
export function errorMessage(code) {
  const messages = {
    [ERROR_CODES.AUTH_LOGIN_FAILED]:     '登录失败，请检查账号密码',
    [ERROR_CODES.AUTH_QR_POLL_FAILED]:   '二维码状态查询失败，请重试',
    [ERROR_CODES.AUTH_QR_CREATE_FAILED]: '二维码生成失败，请重试',
    [ERROR_CODES.AUTH_COOKIE_EXPIRED]:   '登录已过期，请重新登录',
    [ERROR_CODES.MUSIC_API_ERROR]:       '音乐源暂时不可用',
    [ERROR_CODES.MUSIC_NO_URL]:          '该歌曲暂无可用播放链接',
    [ERROR_CODES.TTS_UNAVAILABLE]:       '语音合成服务暂时不可用',
    [ERROR_CODES.LLM_TIMEOUT]:           'AI响应超时，请稍后重试',
    [ERROR_CODES.SEED_POOL_EMPTY]:       '推荐种子池为空',
  };
  return messages[code] || '未知错误';
}
