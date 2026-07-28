/**
 * CommunityContext — 社区模块客户端状态（PRD v0.3 F1-F9）。
 *
 * 遵循 RadioContext 模式：useState 持状态 + useCallback 包方法 + socket 作 prop 注入。
 * - socket emit：用 E.XXX 常量（修正 RadioContext 用字面量的不一致）
 * - HTTP 调用：相对路径 /api/community/*（dev 代理到 3333）
 * - 状态分片：member / feed / inbox / clusters / notifications
 */
import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { E } from '../constants/events.js';

const CommunityContext = createContext(null);

const DEFAULT_COMMUNITY_STATE = {
  // 当前成员（登录后填充）
  currentMember: null, // { userId, nickname, avatarUrl }
  // Feed 帖子列表（最新在前）
  feed: [],
  // 收件箱（F4 分发推送，离线可见）
  inbox: [],
  // 簇列表（F3 聚类结果）
  clusters: [],
  // 实时通知（F4 push / F8 agent-comment / F9 invitation）— 仅内存，不持久
  notifications: [],
  // 我的 agent 配置（F7）
  agentConfig: null, // { canComment, allowedTopics, canBeInvited, sharePlaylists }
  // 活跃房间列表（F5）
  rooms: [],
  // 当前所在房间的实时状态（F5 room:state 推送）
  roomState: null, // { roomId, isPlaying, currentSong, playlists, ... }
  // 我相关的邀请列表（F9）
  invitations: [],
};

/**
 * @param {object} props
 * @param {import('socket.io-client').Socket|null} props.socket
 * @param {React.ReactNode} props.children
 */
export function CommunityProvider({ socket, children }) {
  const [state, setState] = useState(DEFAULT_COMMUNITY_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  const updateState = useCallback((partial) => {
    setState(prev => ({ ...prev, ...partial }));
  }, []);

  // ── Socket emit（Client -> Server）──────────────────────────
  /** 成员登录后绑定 socket 到 user:<uid> room（供定向推送） */
  const identify = useCallback((userId) => {
    if (socket && userId) socket.emit(E.COMMUNITY_IDENTIFY, String(userId));
  }, [socket]);

  const joinRoom = useCallback((roomId) => {
    if (socket && roomId) socket.emit(E.ROOM_JOIN, { roomId });
  }, [socket]);

  const leaveRoom = useCallback((roomId) => {
    if (socket && roomId) socket.emit(E.ROOM_LEAVE, { roomId });
  }, [socket]);

  const roomSkip = useCallback((roomId) => {
    if (socket && roomId) socket.emit(E.ROOM_SKIP, { roomId });
  }, [socket]);

  // ── HTTP 方法（REST API）────────────────────────────────────
  /** 创建成员 + 存网易云凭据（F1）。成功后 identify。 */
  const createMember = useCallback(async ({ userId, nickname, avatarUrl, neteaseUid, cookie }) => {
    const res = await fetch('/api/community/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, nickname, avatarUrl }),
    });
    if (!res.ok) throw new Error('create_member_failed');
    const member = (await res.json()).data;
    if (neteaseUid && cookie) {
      await fetch(`/api/community/members/${userId}/credentials`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ neteaseUid, cookie }),
      });
    }
    updateState({ currentMember: member });
    identify(userId);
    return member;
  }, [identify, updateState]);

  /** 刷新我的画像（F1 P-B）。返回 { profile, degraded }。 */
  const refreshProfile = useCallback(async (userId) => {
    const res = await fetch(`/api/community/profile/${userId}/refresh`, { method: 'POST' });
    if (!res.ok) throw new Error('profile_refresh_failed');
    return (await res.json()).data;
  }, []);

  /** 发帖（F2）。本地不插 feed，等服务端 community:post-new 事件回推（统一来源）。 */
  const createPost = useCallback(async (input) => {
    const res = await fetch('/api/community/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error('create_post_failed');
    return (await res.json()).data;
  }, []);

  /** 拉取 Feed（F6）。cursor 游标分页。 */
  const fetchFeed = useCallback(async ({ cursor = null, limit = 20, forUserId = null } = {}) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor !== null) params.set('cursor', String(cursor));
    if (forUserId) params.set('forUserId', forUserId);
    const res = await fetch(`/api/community/feed?${params}`);
    if (!res.ok) throw new Error('fetch_feed_failed');
    const posts = (await res.json()).data;
    // cursor=null 表示首屏，覆盖；否则追加
    setState(prev => ({
      ...prev,
      feed: cursor === null ? posts : [...prev.feed, ...posts],
    }));
    return posts;
  }, []);

  /** 点赞 */
  const likePost = useCallback(async (postId) => {
    const res = await fetch(`/api/community/posts/${postId}/like`, { method: 'POST' });
    if (!res.ok) throw new Error('like_failed');
    const updated = (await res.json()).data;
    setState(prev => ({
      ...prev,
      feed: prev.feed.map(p => p.id === postId ? updated : p),
    }));
    return updated;
  }, []);

  /** 拉收件箱（F4） */
  const fetchInbox = useCallback(async (userId) => {
    const res = await fetch(`/api/community/inbox?userId=${encodeURIComponent(userId)}`);
    if (!res.ok) throw new Error('fetch_inbox_failed');
    const inbox = (await res.json()).data;
    updateState({ inbox });
    return inbox;
  }, [updateState]);

  /** 拉簇列表（F3） */
  const fetchClusters = useCallback(async () => {
    const res = await fetch('/api/community/clusters');
    if (!res.ok) throw new Error('fetch_clusters_failed');
    const clusters = (await res.json()).data;
    updateState({ clusters });
    return clusters;
  }, [updateState]);

  /** 触发我的 agent 评论某帖（F8，RC7 署名透明） */
  const triggerAgentComment = useCallback(async (postId, byUserId) => {
    const res = await fetch(`/api/community/posts/${postId}/agent-comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ byUserId }),
    });
    if (!res.ok) throw new Error('agent_comment_failed');
    return (await res.json()).data;
  }, []);

  /** 更新我的 agent 配置（F7） */
  const updateAgentConfig = useCallback(async (userId, rules, personaSnapshot = null) => {
    const res = await fetch('/api/community/me/agent-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, rules, personaSnapshot }),
    });
    if (!res.ok) throw new Error('update_agent_config_failed');
    const data = (await res.json()).data;
    updateState({ agentConfig: data.rules });
    return data;
  }, [updateState]);

  // ── F9 邀请 HTTP 方法 ────────────────────────────────────
  /** 发起邀请（邀请某人的 agent） */
  const invite = useCallback(async ({ fromUserId, toUserId, contextType, contextId }) => {
    const res = await fetch('/api/community/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromUserId, toUserId, contextType, contextId }),
    });
    if (!res.ok) throw new Error('invite_failed');
    return (await res.json()).data;
  }, []);

  /** 响应邀请（接受/拒绝） */
  const respondInvitation = useCallback(async (invitationId, status) => {
    const res = await fetch(`/api/community/invitations/${invitationId}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error('respond_invitation_failed');
    const data = (await res.json()).data;
    // 更新本地邀请列表状态
    setState(prev => ({
      ...prev,
      invitations: prev.invitations.map(inv =>
        inv.id === invitationId ? { ...inv, status } : inv
      ),
    }));
    return data;
  }, []);

  /** 拉取我相关的邀请列表 */
  const fetchInvitations = useCallback(async (userId) => {
    const res = await fetch(`/api/community/invitations?userId=${encodeURIComponent(userId)}`);
    if (!res.ok) throw new Error('fetch_invitations_failed');
    const invitations = (await res.json()).data;
    updateState({ invitations });
    return invitations;
  }, [updateState]);

  /** 触发被邀请方 agent 把歌单带入上下文 */
  const bringPlaylist = useCallback(async (invitationId) => {
    const res = await fetch(`/api/community/invitations/${invitationId}/bring-playlist`, { method: 'POST' });
    if (!res.ok) throw new Error('bring_playlist_failed');
    return (await res.json()).data;
  }, []);

  // ── F5 房间 HTTP 方法 ────────────────────────────────────
  /** 拉取活跃房间列表 */
  const fetchRooms = useCallback(async () => {
    const res = await fetch('/api/community/rooms');
    if (!res.ok) throw new Error('fetch_rooms_failed');
    const rooms = (await res.json()).data;
    updateState({ rooms });
    return rooms;
  }, [updateState]);

  /** 创建房间 */
  const createRoom = useCallback(async ({ hostUserId, name, topicTags }) => {
    const res = await fetch('/api/community/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostUserId, name, topicTags }),
    });
    if (!res.ok) throw new Error('create_room_failed');
    return (await res.json()).data;
  }, []);

  /** 加入房间（HTTP 注册 + socket join） */
  const joinRoomHttp = useCallback(async (roomId, userId) => {
    const res = await fetch(`/api/community/rooms/${roomId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) throw new Error('join_room_failed');
    const room = (await res.json()).data;
    joinRoom(roomId); // socket 层加入房间
    updateState({ roomState: null }); // 重置房间状态，等待 room:state 推送
    return room;
  }, [joinRoom, updateState]);

  /** 结束房间（房主） */
  const endRoom = useCallback(async (roomId, userId) => {
    const res = await fetch(`/api/community/rooms/${roomId}/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) throw new Error('end_room_failed');
    leaveRoom(roomId);
    updateState({ roomState: null });
    return (await res.json()).data;
  }, [leaveRoom, updateState]);

  // ── Socket 事件处理器（由 useCommunitySocketEvents 调用）────
  /** 收到新帖（community:post-new）— 插到 feed 顶部，去重 */
  const onPostNew = useCallback((post) => {
    setState(prev => {
      if (prev.feed.some(p => p.id === post.id)) return prev;
      return { ...prev, feed: [post, ...prev.feed] };
    });
  }, []);

  /** 收到 agent 代发评论（community:agent-comment）— 加通知 */
  const onAgentComment = useCallback(({ postId, commentId, agentAuthorUserId }) => {
    setState(prev => ({
      ...prev,
      notifications: [
        { type: 'agent-comment', postId, commentId, agentAuthorUserId, at: Date.now() },
        ...prev.notifications,
      ].slice(0, 50),
    }));
  }, []);

  /** 收到分发推送（community:push）— 加通知 + 可选 inbox 刷新 */
  const onPush = useCallback((payload) => {
    setState(prev => ({
      ...prev,
      notifications: [
        { type: 'push', payload, at: Date.now() },
        ...prev.notifications,
      ].slice(0, 50),
    }));
  }, []);

  /** 我的簇变更（community:cluster-updated）— 更新 currentMember.clusterId */
  const onClusterUpdated = useCallback(({ userId, clusterId, label }) => {
    setState(prev => {
      if (!prev.currentMember || prev.currentMember.userId !== userId) return prev;
      return {
        ...prev,
        currentMember: { ...prev.currentMember, clusterId, clusterLabel: label },
      };
    });
  }, []);

  /** 收到邀请（community:invitation）— 加通知 */
  const onInvitation = useCallback((payload) => {
    setState(prev => ({
      ...prev,
      notifications: [
        { type: 'invitation', payload, at: Date.now() },
        ...prev.notifications,
      ].slice(0, 50),
    }));
  }, []);

  /** 收到房间状态更新（room:state）— 更新当前房间状态 */
  const onRoomState = useCallback((payload) => {
    setState(prev => ({ ...prev, roomState: payload }));
  }, []);

  /** 清空通知 */
  const clearNotifications = useCallback(() => {
    updateState({ notifications: [] });
  }, [updateState]);

  const value = {
    ...state,
    updateState,
    // socket emit
    identify, joinRoom, leaveRoom, roomSkip,
    // http
    createMember, refreshProfile, createPost, fetchFeed, likePost,
    fetchInbox, fetchClusters, triggerAgentComment, updateAgentConfig,
    // F9 invitation http
    invite, respondInvitation, fetchInvitations, bringPlaylist,
    // F5 room http
    fetchRooms, createRoom, joinRoomHttp, endRoom,
    // socket event handlers
    onPostNew, onAgentComment, onPush, onClusterUpdated, onInvitation, onRoomState,
    clearNotifications,
  };

  return <CommunityContext.Provider value={value}>{children}</CommunityContext.Provider>;
}

export function useCommunity() {
  const ctx = useContext(CommunityContext);
  if (!ctx) throw new Error('useCommunity must be used within CommunityProvider');
  return ctx;
}
