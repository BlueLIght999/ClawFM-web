/**
 * CommunityService — 社区发帖 / Feed / 点赞用例（application 层）。
 *
 * 依赖 CommunityRepository Port（持久化）+ postRules（domain 校验）。
 * 不碰 DB 细节、不碰 HTTP/Socket（interface 层职责）。模型不透传：返回 camelCase DTO。
 */
import { validatePost } from '../../domain/community/postRules.js';
import { validateFollow } from '../../domain/community/followRules.js';

/**
 * @param {object} deps
 * @param {import('../ports/repos/CommunityRepository.js').CommunityRepository} deps.communityRepository
 * @param {(userId: string, posts: Array) => Array} [deps.feedPersonalizer] — F9 发现流个性化（按 active feed-invitations 加权）
 * @param {{emit?: (event:string, payload:object, targetUserId?:string|null)=>void}} [deps.eventPublisher] — 用于 community:post-new 广播
 */
export function createCommunityService({ communityRepository, feedPersonalizer, eventPublisher } = {}) {
  const repo = communityRepository;
  const personalize = typeof feedPersonalizer === 'function' ? feedPersonalizer : (_uid, posts) => posts;

  /**
   * 发帖（或评论）。先过 postRules 校验，再持久化。
   * 发帖成功后 emit community:post-new（PRD §6），targetUserId=null 走全广播。
   * 评论（type=comment）不发 post-new，避免评论刷屏 feed（评论走 community:agent-comment 或父帖查询）。
   * @returns {{ok:true, post:object} | {ok:false, error:string}}
   */
  function createPost(input) {
    const result = validatePost(input);
    if (!result.ok) return result;
    const post = result.post;
    const id = repo.createPost({
      userId: input.userId,
      type: post.type,
      content: post.content,
      parentId: post.parentId,
      songId: post.songId,
      playlistId: post.playlistId,
      songTitle: input.songTitle || null,
      cover: input.cover || null,
      autoTags: Array.isArray(input.autoTags) ? input.autoTags : [],
      isAgent: !!input.isAgent,
      agentAuthorUserId: input.agentAuthorUserId || null,
    });
    const saved = repo.getPost(id);
    if (post.type !== 'comment') {
      eventPublisher?.emit?.('community:post-new', saved, null);
    }
    return { ok: true, post: saved };
  }

  /**
   * Feed。传 forUserId 时按其 active feed-invitations 个性化排序（F9）。
   */
  function getFeed({ limit, cursor, forUserId } = {}) {
    const posts = repo.listFeed({ limit, cursor });
    if (!forUserId) return posts;
    return personalize(forUserId, posts);
  }

  function getPost(id) {
    return repo.getPost(id);
  }

  function getPostWithComments(id) {
    const post = repo.getPost(id);
    if (!post) return null;
    return { post, comments: repo.listComments(id) };
  }

  function listComments(parentId) {
    return repo.listComments(parentId);
  }

  function likePost(id) {
    repo.likePost(id);
    return repo.getPost(id);
  }

  /**
   * 点赞 toggle（社交化）。幂等：已赞则取消，未赞则点赞。
   * 同步 posts.likes 计数。post 不存在返回 null。
   * @returns {{liked:boolean, likes:number} | null}
   */
  function toggleLike(userId, postId) {
    return repo.toggleLike(String(userId), Number(postId));
  }

  function hasLiked(userId, postId) {
    return repo.hasLiked(String(userId), Number(postId));
  }

  function listLikers(postId) {
    return repo.listLikers(Number(postId));
  }

  /**
   * 创建评论（type=comment）。校验父帖存在 + postRules。
   * 评论不发 community:post-new（避免刷屏 feed），改发 community:comment-new 定向到父帖作者。
   * @returns {{ok:true, comment:object} | {ok:false, error:string}}
   */
  function createComment(userId, postId, content) {
    const parent = repo.getPost(Number(postId));
    if (!parent) return { ok: false, error: 'parent_not_found' };
    const result = validatePost({ type: 'comment', content, parentId: Number(postId) });
    if (!result.ok) return result;
    const id = repo.createPost({
      userId: String(userId),
      type: 'comment',
      content: result.post.content,
      parentId: Number(postId),
      autoTags: [],
      isAgent: false,
      agentAuthorUserId: null,
    });
    const saved = repo.getPost(id);
    // 定向通知父帖作者（非自评时）
    if (parent.userId && String(parent.userId) !== String(userId)) {
      eventPublisher?.emit?.('community:comment-new', saved, parent.userId);
    }
    return { ok: true, comment: saved };
  }

  // ── 关注关系（社交图谱） ───────────────────────────────────
  function follow(followerId, followeeId) {
    const check = validateFollow(followerId, followeeId);
    if (!check.ok) return { ok: false, error: check.error };
    repo.follow(String(followerId), String(followeeId));
    eventPublisher?.emit?.('community:follow', { followerId, followeeId }, String(followeeId));
    return { ok: true, following: true };
  }

  function unfollow(followerId, followeeId) {
    const check = validateFollow(followerId, followeeId);
    if (!check.ok) return { ok: false, error: check.error };
    repo.unfollow(String(followerId), String(followeeId));
    return { ok: true, following: false };
  }

  function isFollowing(followerId, followeeId) {
    return repo.isFollowing(String(followerId), String(followeeId));
  }

  function listFollowers(userId) {
    return repo.listFollowers(String(userId));
  }

  function listFollowing(userId) {
    return repo.listFollowing(String(userId));
  }

  // ── timeline + 关注流 ─────────────────────────────────────
  function listPostsByUser(userId, opts) {
    return repo.listPostsByUser(String(userId), opts || {});
  }

  function listFeedFromFollowing(userId, opts) {
    return repo.listFeedFromFollowing(String(userId), opts || {});
  }

  /**
   * 收件箱（F4 离线推送可见）。直接走 repo 即可，service 仅作统一入口。
   */
  function listInbox(userId) {
    return repo.listInbox(userId);
  }

  return {
    createPost, getFeed, getPost, getPostWithComments, listComments,
    likePost, toggleLike, hasLiked, listLikers, createComment,
    follow, unfollow, isFollowing, listFollowers, listFollowing,
    listPostsByUser, listFeedFromFollowing,
    listInbox,
  };
}
