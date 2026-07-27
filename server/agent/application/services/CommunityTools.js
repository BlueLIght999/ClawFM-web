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
    description: '被邀请的 agent 把主人网易云歌单带入目标上下文（需邀请已 active）。',
    parameters: {
      type: 'object',
      properties: { invitationId: { type: 'number' } },
      required: ['invitationId'],
    },
    execute: async (args) => {
      const r = await invitationService.bringPlaylist(args.invitationId);
      return r.ok
        ? { handled: true, invitationId: args.invitationId, playlistCount: r.playlists.length }
        : { handled: false, error: r.error };
    },
  }));

  return registry;
}
