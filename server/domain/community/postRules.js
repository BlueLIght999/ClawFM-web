/**
 * postRules — 社区帖子领域规则（domain 层，零 IO）。
 *
 * 校验帖子创建输入，产出规范化 post 对象或错误。
 * 纯函数：遵循 D1/D2，不 import node 内置、不碰 IO。
 */

export const POST_TYPES = ['reflection', 'history', 'recommend', 'comment'];

export const MAX_CONTENT_LENGTH = 2000;

/**
 * 去除首尾空白并进行 HTML 转义防护 XSS。非字符串返回 ''。
 * HTML 实体转义：防止恶意脚本注入（如 <script>alert('XSS')</script>）
 */
export function sanitizeContent(content) {
  if (typeof content !== 'string') return '';

  return content
    .trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * 校验并规范化帖子输入。
 * @param {object} input
 * @param {string} input.type        - reflection/history/recommend/comment
 * @param {string} input.content     - 正文
 * @param {number} [input.parentId]  - comment 必填
 * @param {string} [input.songId]    - recommend 必填
 * @param {string} [input.playlistId]
 * @returns {{ok:true, post:object} | {ok:false, error:string}}
 */
export function validatePost(input) {
  const { type, content, parentId, songId, playlistId } = input || {};

  if (!POST_TYPES.includes(type)) {
    return { ok: false, error: 'invalid_type' };
  }

  const trimmed = sanitizeContent(content);
  if (trimmed.length === 0) {
    return { ok: false, error: 'content_empty' };
  }
  if (trimmed.length > MAX_CONTENT_LENGTH) {
    return { ok: false, error: 'content_too_long' };
  }

  if (type === 'comment' && !parentId) {
    return { ok: false, error: 'comment_requires_parent' };
  }
  if (type === 'recommend' && !songId) {
    return { ok: false, error: 'recommend_requires_song' };
  }

  return {
    ok: true,
    post: {
      type,
      content: trimmed,
      parentId: parentId || null,
      songId: songId || null,
      playlistId: playlistId || null,
    },
  };
}
