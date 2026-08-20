/**
 * useCommunitySocketEvents — 订阅社区模块的 Server -> Client 事件（PRD v0.3）。
 *
 * 遵循 useRadioSocketEvents 模式：
 * - useEffect 内 socket.on(E.XXX, handler) 注册
 * - cleanup 逐个 socket.off(E.XXX)（不用 removeAllListeners，避免误伤其它 hook）
 * - 依赖数组完整列出 ctx 方法，保证 value 变化时重新订阅
 * - socket 为 null 时直接 return（守卫）
 *
 * 订阅 6 个事件：community:post-new / community:agent-comment /
 * community:push / community:cluster-updated / community:invitation / room:state
 *
 * 在 App.jsx 调用，不在 CommunityProvider 内部调用。
 */
import { useEffect } from 'react';
import { E } from '../constants/events.js';
import { useCommunity } from '../contexts/CommunityContext.jsx';

export function useCommunitySocketEvents(socket) {
  const {
    onPostNew, onAgentComment, onPush, onClusterUpdated, onInvitation,
    onCommentNew, onFollow, onRoomState, onDmNew,
  } = useCommunity();

  useEffect(() => {
    if (!socket) return;

    socket.on(E.COMMUNITY_POST_NEW, onPostNew);
    socket.on(E.COMMUNITY_AGENT_COMMENT, onAgentComment);
    socket.on(E.COMMUNITY_COMMENT_NEW, onCommentNew);
    socket.on(E.COMMUNITY_FOLLOW, onFollow);
    socket.on(E.COMMUNITY_PUSH, onPush);
    socket.on(E.COMMUNITY_CLUSTER_UPDATED, onClusterUpdated);
    socket.on(E.COMMUNITY_INVITATION, onInvitation);
    socket.on(E.COMMUNITY_DM_NEW, onDmNew);
    socket.on(E.ROOM_STATE, onRoomState);

    return () => {
      socket.off(E.COMMUNITY_POST_NEW);
      socket.off(E.COMMUNITY_AGENT_COMMENT);
      socket.off(E.COMMUNITY_COMMENT_NEW);
      socket.off(E.COMMUNITY_FOLLOW);
      socket.off(E.COMMUNITY_PUSH);
      socket.off(E.COMMUNITY_CLUSTER_UPDATED);
      socket.off(E.COMMUNITY_INVITATION);
      socket.off(E.COMMUNITY_DM_NEW);
      socket.off(E.ROOM_STATE);
    };
  }, [socket, onPostNew, onAgentComment, onCommentNew, onFollow, onPush, onClusterUpdated, onInvitation, onRoomState, onDmNew]);
}
