/**
 * CommunityTools — 注册社区 Agent 工具到 ToolRegistry（F4/F8/F9）。
 *
 * 与 ToolFactory 解耦：单独注册器，bootstrap 在 createToolFactory 之后调用。
 * 工具闭包注入 community 服务，不 import infrastructure（守 agent/application 纯度）。
 */
import { createToolDefinition } from '../../domain/toolDefinition.js';

/**
 * @param {object} deps
 * @param {object} deps.registry
 * @param {object} [deps.distributionService]
 * @param {object} [deps.memberAgentService]
 * @param {object} [deps.invitationService]
 */
export function registerCommunityTools({ registry, distributionService, memberAgentService, invitationService }) {
  if (!distributionService || !memberAgentService || !invitationService) {
    return registry; // 社区未启用则跳过
  }

  registry.register(createToolDefinition({
    name: 'distribute_to_cluster',
    description: '把帖子/歌单/歌曲推送给匹配簇的所有成员。contentTags 用于簇匹配。',
    parameters: {
      type: 'object',
      properties: {
        targetType: { type: 'string', enum: ['post', 'playlist', 'song'] },
        targetId: { type: 'string' },
        contentTags: { type: 'array', items: { type: 'string' } },
        reason: { type: 'string' },
      },
      required: ['targetType', 'targetId'],
    },
    execute: async (args) => {
      const r = distributionService.distribute({
        targetType: args.targetType,
        targetId: args.targetId,
        contentTags: args.contentTags,
        reason: args.reason,
      });
      return { handled: true, pushedTo: r.pushedTo, skipped: r.skipped, matchedClusters: r.matchedClusters };
    },
  }));

  registry.register(createToolDefinition({
    name: 'comment_as_member_agent',
    description: '成员触发：用其 agent persona 在指定帖子下生成评论（RC7 署名透明）。',
    parameters: {
      type: 'object',
      properties: { postId: { type: 'number' }, byUserId: { type: 'string' } },
      required: ['postId', 'byUserId'],
    },
    execute: async (args) => {
      const r = await memberAgentService.commentOnPost({ postId: args.postId, byUserId: args.byUserId });
      return r.ok ? { handled: true, commentId: r.commentId } : { handled: false, error: r.error };
    },
  }));

  registry.register(createToolDefinition({
    name: 'invite_member_agent',
    description: '邀请某成员的 agent 携带其歌单与画像进入我的上下文（RC8 双向授权）。',
    parameters: {
      type: 'object',
      properties: {
        fromUserId: { type: 'string' },
        toUserId: { type: 'string' },
        contextType: { type: 'string', enum: ['feed', 'room', 'conversation'] },
        contextId: { type: 'string' },
      },
      required: ['fromUserId', 'toUserId'],
    },
    execute: async (args) => {
      const r = invitationService.invite({
        fromUserId: args.fromUserId,
        toUserId: args.toUserId,
        contextType: args.contextType || 'feed',
        contextId: args.contextId,
      });
      return r.ok ? { handled: true, id: r.id, status: r.status } : { handled: false, error: r.error, reasons: r.reasons };
    },
  }));

  registry.register(createToolDefinition({
    name: 'bring_playlist',
    description: '被邀请的 agent 把主人网易云歌单带入目标上下文（需邀请已 active，且仅被邀请方本人可触发）。',
    parameters: {
      type: 'object',
      properties: { invitationId: { type: 'number' } },
      required: ['invitationId'],
    },
    execute: async (args) => {
      // 本工具拿不到可信调用者身份：args 全部由 LLM 生成，只有 invitationId，
      // 没有任何字段能证明「谁在调用」。bringPlaylist 现在的授权前提是调用者必须是
      // 被邀请方本人（它要解密那个人的 cookie），所以这里无法安全地代填一个身份——
      // 传空串会被 not_participant 挡下，等于显式失败；这正是本步想要的效果。
      //
      // 不在工具层补一个 fromUserId 参数：那只是把「模型自报身份」当成身份，比不校验
      // 更糟（看起来有校验）。要恢复这条路径，正确做法是让 socket 侧把已认证的成员 id
      // 注入工具上下文，而不是从 args 取。在那之前，这条工具路径保持显式失败。
      const r = await invitationService.bringPlaylist(args.invitationId, null);
      return r.ok
        ? { handled: true, invitationId: args.invitationId, playlistCount: r.playlists.length }
        : { handled: false, error: r.error };
    },
  }));

  return registry;
}
