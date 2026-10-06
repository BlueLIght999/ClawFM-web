/**
 * CommunityTools — 注册社区 Agent 工具到 ToolRegistry（F4/F8/F9）。
 *
 * 与 ToolFactory 解耦：单独注册器，bootstrap 在 createToolFactory 之后调用。
 * 工具闭包注入 community 服务，不 import infrastructure（守 agent/application 纯度）。
 *
 * 代成员行事的工具（代评 / 邀请 / 带歌单）身份只取运行循环注入的 context.callerUserId
 * （socket 登录态，见 AgentLoopService.executeToolSafely），从不取 args：args 由模型
 * 生成、对话就能改写，所以参数表里也不放任何身份字段。
 */
import { createToolDefinition } from '../../domain/toolDefinition.js';

/**
 * 与 HTTP requireCommunityAuth 同构：没有可信调用者就不进 service，直接 auth_required。
 * 包在 execute 外面而不是每个工具各判一次，新加的成员工具也就漏不掉这道校验。
 * @param {(args: object, callerUserId: string) => Promise<object>} run
 * @returns {(args?: object, context?: {callerUserId?: string|number|null}) => Promise<object>}
 */
function requireCaller(run) {
  return async (args, context) => {
    const callerUserId = context?.callerUserId;
    if (!callerUserId) return { handled: false, error: 'auth_required' };
    return run(args || {}, String(callerUserId));
  };
}

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
    description: '用当前登录成员的 agent persona 在指定帖子下生成评论（RC7 署名透明）。',
    parameters: {
      type: 'object',
      properties: { postId: { type: 'number' } },
      required: ['postId'],
    },
    execute: requireCaller(async (args, callerUserId) => {
      const r = await memberAgentService.commentOnPost({ postId: args.postId, byUserId: callerUserId });
      return r.ok ? { handled: true, commentId: r.commentId } : { handled: false, error: r.error };
    }),
  }));

  registry.register(createToolDefinition({
    name: 'invite_member_agent',
    description: '以当前登录成员的名义，邀请某成员的 agent 携带其歌单与画像进入我的上下文（RC8 双向授权）。',
    parameters: {
      type: 'object',
      properties: {
        toUserId: { type: 'string' },
        contextType: { type: 'string', enum: ['feed', 'room', 'conversation'] },
        contextId: { type: 'string' },
      },
      required: ['toUserId'],
    },
    execute: requireCaller(async (args, callerUserId) => {
      const r = invitationService.invite({
        fromUserId: callerUserId,
        toUserId: args.toUserId,
        contextType: args.contextType || 'feed',
        contextId: args.contextId,
      });
      return r.ok ? { handled: true, id: r.id, status: r.status } : { handled: false, error: r.error, reasons: r.reasons };
    }),
  }));

  registry.register(createToolDefinition({
    name: 'bring_playlist',
    description: '把被邀请方的网易云歌单带入邀请上下文（邀请须已 active、被邀请方仍开着歌单分享；邀请双方任一方均可触发）。',
    parameters: {
      type: 'object',
      properties: { invitationId: { type: 'number' } },
      required: ['invitationId'],
    },
    // 是否为邀请参与方、被邀请方是否仍在分享，都由 bringPlaylist 在解密 cookie 之前判定
    execute: requireCaller(async (args, callerUserId) => {
      const r = await invitationService.bringPlaylist(args.invitationId, callerUserId);
      return r.ok
        ? { handled: true, invitationId: args.invitationId, playlistCount: r.playlists.length }
        : { handled: false, error: r.error };
    }),
  }));

  return registry;
}
