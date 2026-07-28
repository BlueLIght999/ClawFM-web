/**
 * useCommunitySocketEvents — 订阅社区模块的 Server -> Client 事件（PRD v0.3）。
 *
 * 遵循 useRadioSocketEvents 模式：
 * - useEffect 内 socket.on(E.XXX, handler) 注册
 * - cleanup 逐个 socket.off(E.XXX)（不用 removeAllListeners，避免误伤其它 hook）
 * - 依赖数组完整列出 ctx 方法，保证 value 变化时重新订阅
 * - socket 为 null 时直接 return（守卫）
 *
 * 订阅 5 个事件：community:post-new / community:agent-comment /
 * community:push / community:cluster-updated / community:invitation
 *
 * 在 App.jsx 调用，不在 CommunityProvider 内部调用。
 */
import { useEffect } from 'react';
import { E } from '../constants/events.js';
import { useCommunity } from '../contexts/CommunityContext.jsx';

export function useCommunitySocketEvents(socket) {
  const {
    onPostNew, onAgentComment, onPush, onClusterUpdated, onInvitation,
  } = useCommunity();

  useEffect(() => {
    if (!socket) return;

    socket.on(E.COMMUNITY_POST_NEW, onPostNew);
    socket.on(E.COMMUNITY_AGENT_COMMENT, onAgentComment);
    socket.on(E.COMMUNITY_PUSH, onPush);
    socket.on(E.COMMUNITY_CLUSTER_UPDATED, onClusterUpdated);
    socket.on(E.COMMUNITY_INVITATION, onInvitation);

    return () => {
      socket.off(E.COMMUNITY_POST_NEW);
      socket.off(E.COMMUNITY_AGENT_COMMENT);
      socket.off(E.COMMUNITY_PUSH);
      socket.off(E.COMMUNITY_CLUSTER_UPDATED);
      socket.off(E.COMMUNITY_INVITATION);
    };
  }, [socket, onPostNew, onAgentComment, onPush, onClusterUpdated, onInvitation]);
}
