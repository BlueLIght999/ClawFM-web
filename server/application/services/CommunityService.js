/**
 * CommunityService — 社区发帖 / Feed / 点赞用例（application 层）。
 *
 * 依赖 CommunityRepository Port（持久化）+ postRules（domain 校验）。
 * 不碰 DB 细节、不碰 HTTP/Socket（interface 层职责）。模型不透传：返回 camelCase DTO。
 */
import { validatePost } from '../../domain/community/postRules.js';

/**
 * @param {object} deps
 * @param {import('../ports/repos/CommunityRepository.js').CommunityRepository} deps.communityRepository
 * @param {(userId: string, posts: Array) => Array} [deps.feedPersonalizer] — F9 发现流个性化（按 active feed-invitations 加权）
 */
export function createCommunityService({ communityRepository, feedPersonalizer } = {}) {
  const repo = communityRepository;
  const personalize = typeof feedPersonalizer === 'function' ? feedPersonalizer : (_uid, posts) => posts;

  /**
   * 发帖（或评论）。先过 postRules 校验，再持久化。
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
      autoTags: Array.isArray(input.autoTags) ? input.autoTags : [],
      isAgent: !!input.isAgent,
      agentAuthorUserId: input.agentAuthorUserId || null,
    });
    return { ok: true, post: repo.getPost(id) };
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

  return { createPost, getFeed, getPost, getPostWithComments, listComments, likePost };
}
