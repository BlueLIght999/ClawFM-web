/**
 * CommunityService — 社区发帖 / Feed / 点赞用例（application 层）。
 *
 * 依赖 CommunityRepository Port（持久化）+ postRules（domain 校验）。
 * 不碰 DB 细节、不碰 HTTP/Socket（interface 层职责）。模型不透传：返回 camelCase DTO。
 */
import { validatePost } from '../../domain/community/postRules.js';
import { validateFollow } from '../../domain/community/followRules.js';
import { extractPostTags } from '../../domain/community/postTagRules.js';
import { clipSummary } from '../../domain/community/distributionRules.js';

/**
 * @param {{communityRepository: import('../ports/repos/CommunityRepository.js').CommunityRepository, feedPersonalizer?: ((userId: string, posts: Array) => Array), postDistributor?: ((post: object) => void), songLikeSharer?: ((like: {userId: string, songId: string, summary: string}) => void), eventPublisher?: {emit?: (event:string, payload:object, targetUserId?:string|null)=>void}, logger?: {warn?: Function}}} [deps]
 *   feedPersonalizer: F9 发现流个性化（按 active feed-invitations 加权）；
 *   postDistributor: F4 发帖触发分发（按帖子 autoTags 推给匹配簇）；
 *   songLikeSharer: F4 点歌触发分发（推给点赞者的同簇成员）；
 *   eventPublisher: 用于 community:post-new 广播
 */
// The `= {}` default is cast rather than the dependency being marked optional:
// communityRepository is genuinely required (every method dereferences it), so
// typing it optional would trade one honest error for ~100 false
// possibly-undefined ones. A caller that omits it fails at first use -- which is
// the existing behaviour -- and the cast keeps that contract documented.
export function createCommunityService({communityRepository, feedPersonalizer, postDistributor, songLikeSharer, eventPublisher, logger} = /** @type {any} */ ({})) {
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
      // 调用方给了就用（agent 评论沿用父帖标签）；否则从原文认——读 input.content
      // 而非已转义的 post.content，后者会把「R&B」变成「R&amp;B」
      autoTags: Array.isArray(input.autoTags) && input.autoTags.length > 0
        ? input.autoTags
        : extractPostTags(input.content),
      isAgent: !!input.isAgent,
      agentAuthorUserId: input.agentAuthorUserId || null,
    });
    const saved = repo.getPost(id);
    if (post.type !== 'comment') {
      eventPublisher?.emit?.('community:post-new', saved, null);
      distributePost(saved);
    }
    return { ok: true, post: saved };
  }

  /**
   * F4：成员发帖 → 推给标签匹配的簇。没有标签的帖子匹配不到任何簇，不进分发。
   * 分发是增强：它失败不该让已落库的帖子对发帖人显示为失败，所以这里兜住。
   * @param {object|null} saved
   */
  function distributePost(saved) {
    if (typeof postDistributor !== 'function') return;
    if (!Array.isArray(saved?.autoTags) || saved.autoTags.length === 0) return;
    try {
      postDistributor(saved);
    } catch (e) {
      logger?.warn?.({ component: 'community', postId: saved.id, err: e?.message }, 'post distribution failed');
    }
  }

  /**
   * Feed。传 forUserId 时按其 active feed-invitations 个性化排序（F9）。
   *
   * @param {{limit?: number, cursor?: number|null, forUserId?: string|number|null}} [params]
   *   Destructured with a bare `= {}` default and no tag: tsc then types the
   *   pattern from an empty literal and rejects every field read (TS2339 x3).
   */
  function getFeed({ limit = 20, cursor = null, forUserId } = {}) {
    // Normalised here to satisfy the port's `{limit:number, cursor:number|null}`
    // contract. The adapter would cope with undefined (it applies Number()||20 and
    // treats null|undefined alike), but the port is the boundary and a caller that
    // passes a genuinely missing cursor should say so explicitly.
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

  /**
   * 成员点赞正在听的歌（F4「成员点赞某歌 → 推给同簇其他人」）。
   *
   * 幂等：同一首歌只记一次 liked。连点若每次都记，画像融合里的 replay_lover
   * 计数会被刷高；分发虽有 24h 去重，也不必每次都去查一遍同簇成员。
   *
   * @param {{userId: string, songId: string, title?: string, artist?: string}} input
   * @returns {{ok:true, liked:true, alreadyLiked:boolean} | {ok:false, error:string}}
   */
  function likeSong({ userId, songId, title, artist }) {
    const id = typeof songId === 'string' || typeof songId === 'number' ? String(songId).trim() : '';
    if (!id) return { ok: false, error: 'song_id_required' };
    if (!repo.getMember(String(userId))) return { ok: false, error: 'not_member' };
    if (repo.hasListenAction(String(userId), id, 'liked')) return { ok: true, liked: true, alreadyLiked: true };

    const cleanTitle = clipSummary(title);
    const cleanArtist = clipSummary(artist);
    repo.recordListen({ userId: String(userId), songId: id, title: cleanTitle, artist: cleanArtist, action: 'liked' });
    shareLike({
      userId: String(userId),
      songId: id,
      summary: clipSummary([cleanTitle, cleanArtist].filter(Boolean).join(' — ')) || id,
    });
    return { ok: true, liked: true, alreadyLiked: false };
  }

  /** 与 distributePost 同理：分发失败不影响点赞本身。 */
  function shareLike(like) {
    if (typeof songLikeSharer !== 'function') return;
    try {
      songLikeSharer(like);
    } catch (e) {
      logger?.warn?.({ component: 'community', songId: like.songId, err: e?.message }, 'song like sharing failed');
    }
  }

  return {
    createPost, getFeed, getPost, getPostWithComments, listComments,
    likePost, toggleLike, hasLiked, listLikers, createComment,
    follow, unfollow, isFollowing, listFollowers, listFollowing,
    listPostsByUser, listFeedFromFollowing,
    listInbox, likeSong,
  };
}
