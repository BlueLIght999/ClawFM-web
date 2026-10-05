/**
 * CommunityContext — 社区模块客户端状态（PRD v0.3 F1-F9）。
 *
 * 遵循 RadioContext 模式：useState 持状态 + useCallback 包方法 + socket 作 prop 注入。
 * - socket emit：用 E.XXX 常量（修正 RadioContext 用字面量的不一致）
 * - HTTP 调用：相对路径 /api/community/*（dev 代理到 3333）
 * - 状态分片：member / feed / inbox / clusters / notifications
 */
import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { E } from '../constants/events.js';

const CommunityContext = createContext(null);

const DEFAULT_COMMUNITY_STATE = {
  // 当前成员（登录后填充）
  currentMember: null, // { userId, nickname, avatarUrl }
  // 当前登录网易云 uid（auth:login-success 后设置，社区 userId 须与之一致）
  authUid: null,
  // Feed 帖子列表（最新在前）
  feed: [],
  // 关注流（我关注的人的帖子，社交发现）
  followingFeed: [],
  // 评论缓存：{ [postId]: comment[] }，按需懒加载
  commentsByPost: {},
  // 成员资料缓存：{ [userId]: { ...member, isFollowing, followersCount, followingCount } }
  memberCache: {},
  // 收件箱（F4 分发推送，离线可见）
  inbox: [],
  // 本次会话里点赞过的歌 id（F4 点赞某歌）。服务端按歌幂等，这里只给按钮一个已赞态
  likedSongIds: [],
  // 簇列表（F3 聚类结果）
  clusters: [],
  // 实时通知（F4 push / F8 agent-comment / F9 invitation / comment-new / follow）— 仅内存
  notifications: [],
  // 我的 agent 配置（F7）
  agentConfig: null, // { canComment, allowedTopics, canBeInvited, sharePlaylists }
  // 活跃房间列表（F5）
  rooms: [],
  // 当前所在房间的实时状态（F5 room:state 推送）
  roomState: null, // { roomId, isPlaying, currentSong, playlists, ... }
  // 我相关的邀请列表（F9）
  invitations: [],
  // 与我兴趣标签最重合的成员（F1 自填标签的下游：邀请候选）
  similarMembers: [],
  // 上面那份候选里「我自己有没有标签」。false 表示还没填标签（该引导去填），
  // true 且候选为空才是「有标签但暂无相似的人」——两种空状态的提示不同
  similarHasTags: false,
  // 私信会话列表（DM / agent DM）：{ id, peer:{userId,nickname,avatarUrl,isAgent}, lastMessage, ... }
  dmThreads: [],
  // 私信会话消息缓存：{ [threadId]: message[] }（按需拉取）
  dmMessagesByThread: {},
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
  /** 创建成员（F1）。后端自动绑定网易云凭据。成功后 identify + 持久化。 */
  const createMember = useCallback(async ({ userId, nickname, avatarUrl }) => {
    const res = await fetch('/api/community/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, nickname, avatarUrl }),
    });
    if (!res.ok) throw new Error('create_member_failed');
    const member = (await res.json()).data;
    // 持久化到 localStorage（刷新后恢复身份 + re-identify）
    try { localStorage.setItem('community:member', JSON.stringify(member)); } catch { /* ignore */ }
    updateState({ currentMember: member });
    identify(userId);
    return member;
  }, [identify, updateState]);

  // ── 头像 / 资料更新 ────────────────────────────────────────
  /** 更新昵称（与/或头像 URL）。成功后刷新 currentMember + localStorage。 */
  const updateMemberProfile = useCallback(async ({ userId, nickname, avatarUrl }) => {
    const res = await fetch(`/api/community/members/${encodeURIComponent(userId)}/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname, avatarUrl }),
    });
    if (!res.ok) throw new Error('update_profile_failed');
    const member = (await res.json()).data;
    try { localStorage.setItem('community:member', JSON.stringify(member)); } catch { /* ignore */ }
    updateState({ currentMember: member });
    return member;
  }, [updateState]);

  /** 上传头像（base64）。POST→服务端存 BLOB，成功后头像 URL 指向取图路由。 */
  const updateAvatar = useCallback(async ({ userId, dataUrl }) => {
    const [head, data] = String(dataUrl || '').split(',');
    if (!data) throw new Error('avatar_data_missing');
    const mimeType = /^data:(.*?);/.exec(head)?.[1] || 'image/png';
    const res = await fetch(`/api/community/members/${encodeURIComponent(userId)}/avatar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, mimeType }),
    });
    if (!res.ok) throw new Error('avatar_upload_failed');
    const member = (await res.json()).data;
    try { localStorage.setItem('community:member', JSON.stringify(member)); } catch { /* ignore */ }
    updateState({ currentMember: member });
    return member;
  }, [updateState]);

  /** 更新自填兴趣标签（F1）。后端归一后重建画像，返回落库的标签列表。 */
  const updateSelfTags = useCallback(async (userId, selfTags) => {
    const res = await fetch(`/api/community/members/${encodeURIComponent(userId)}/self-tags`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selfTags }),
    });
    if (!res.ok) {
      // 后端以 error 字段说明原因（too_long/too_many/not_array），前端据此提示
      let error = 'update_self_tags_failed';
      try { error = (await res.json()).error || error; } catch { /* 非 JSON 响应，沿用默认错误码 */ }
      throw new Error(error);
    }
    const data = (await res.json()).data;
    // 用后端归一后的列表覆盖本地，避免前端残留未 trim/未去重的原始输入
    const current = stateRef.current.currentMember;
    if (current) updateState({ currentMember: { ...current, selfTags: data.selfTags } });
    return data;
  }, [updateState]);

  /**
   * 拉「与我兴趣标签最重合的其他成员」（F1 自填标签的下游消费）。
   *
   * userId 只用来拼 URL：服务端那条路由走 assertSelf，非本人一律 403，
   * 所以这里传别人的 id 拿不到数据，不需要在前端再拦一道。
   *
   * 不做静默降级：失败就抛，由调用方决定是提示还是回落到手填输入。
   */
  const fetchSimilarMembers = useCallback(async (userId) => {
    const res = await fetch(`/api/community/members/${encodeURIComponent(userId)}/similar`, { method: 'GET' });
    if (!res.ok) throw new Error('fetch_similar_members_failed');
    const data = (await res.json()).data;
    updateState({
      similarMembers: Array.isArray(data?.candidates) ? data.candidates : [],
      similarHasTags: data?.hasTags === true,
    });
    return data;
  }, [updateState]);

  // 刷新恢复：从 localStorage 读 currentMember，自动 re-identify（修复 B-C7）
  useEffect(() => {
    try {
      const saved = localStorage.getItem('community:member');
      if (saved) {
        const member = JSON.parse(saved);
        updateState({ currentMember: member });
        identify(member.userId);
      }
    } catch { /* ignore */ }
  }, [identify, updateState]);

  // 登录成功后自动加入社区（用网易云 uid 作为社区 userId，后端自动绑定凭据）
  useEffect(() => {
    if (!socket) return undefined;
    const handleLoginSuccess = async (payload) => {
      const profile = payload?.profile || payload;
      const uid = profile?.userId;
      if (!uid) return;
      updateState({ authUid: String(uid) });
      // 已有当前成员且 uid 匹配则只 re-identify
      if (stateRef.current?.currentMember?.userId === String(uid)) {
        identify(String(uid));
        return;
      }
      // 自动创建社区身份（幂等，ON CONFLICT DO UPDATE）
      try {
        await createMember({
          userId: String(uid),
          nickname: profile.nickname || '',
          avatarUrl: profile.avatarUrl || '',
        });
      } catch {
        identify(String(uid));
      }
    };
    socket.on('auth:login-success', handleLoginSuccess);
    return () => socket.off('auth:login-success', handleLoginSuccess);
  }, [socket, identify, createMember]);

  // 刷新/重启后补拉一次登录态：若网易云会话仍有效则设置 authUid，并幂等补齐成员身份（修复“nickname 无法 join”）
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/status')
      .then(r => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        const profile = data?.profile || data?.account?.profile;
        // 优先取服务端持久化登录态字段 uid（无网络拉取依赖，与服务端 requireCommunityAuth 同源），
        // 避免网易云 login/status 冷启动/波动导致 profile 缺失而无法 join。
        const uid = data?.uid || profile?.userId;
        if (!uid) return; // 未登录：保持现状，加入按钮提示需网易云登录
        const uidStr = String(uid);
        updateState({ authUid: uidStr });
        const cur = stateRef.current?.currentMember;
        if (cur?.userId === uidStr) { identify(uidStr); return; }
        const nickname = profile?.nickname || cur?.nickname || '';
        const avatarUrl = profile?.avatarUrl || cur?.avatarUrl || '';
        createMember({ userId: uidStr, nickname, avatarUrl }).catch(() => identify(uidStr));
      })
      .catch(() => { /* 忽略非致命 */ });
    return () => { cancelled = true; };
  }, [createMember, identify, updateState]);

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

  /** 点赞 toggle（社交化）。后端返回 { liked, likes }，合并到 feed 帖子。 */
  const likePost = useCallback(async (postId) => {
    const res = await fetch(`/api/community/posts/${postId}/like`, { method: 'POST' });
    if (!res.ok) throw new Error('like_failed');
    const { liked, likes } = (await res.json()).data;
    setState(prev => ({
      ...prev,
      feed: prev.feed.map(p => p.id === postId ? { ...p, liked, likes } : p),
      followingFeed: prev.followingFeed.map(p => p.id === postId ? { ...p, liked, likes } : p),
    }));
    return { liked, likes };
  }, []);

  /**
   * 点赞正在听的歌（F4「成员点赞某歌 → 推给同簇其他人」）。
   * 身份由服务端取登录态；body 只带收件人那边展示用的歌名/歌手。
   */
  const likeSong = useCallback(async ({ songId, title, artist }) => {
    const res = await fetch(`/api/community/songs/${encodeURIComponent(songId)}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, artist }),
    });
    if (!res.ok) {
      let error = 'like_song_failed';
      try { error = (await res.json()).error || error; } catch { /* 非 JSON 响应，沿用默认错误码 */ }
      throw new Error(error);
    }
    const data = (await res.json()).data;
    const id = String(songId);
    setState(prev => (prev.likedSongIds.includes(id)
      ? prev
      : { ...prev, likedSongIds: [...prev.likedSongIds, id] }));
    return data;
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

  // ── 社交方法：评论 / 关注 / 成员主页 / timeline ───────────
  /** 拉取帖子评论（懒加载到 commentsByPost） */
  const fetchComments = useCallback(async (postId) => {
    const res = await fetch(`/api/community/posts/${postId}/comments`);
    if (!res.ok) throw new Error('fetch_comments_failed');
    const comments = (await res.json()).data;
    setState(prev => ({ ...prev, commentsByPost: { ...prev.commentsByPost, [postId]: comments } }));
    return comments;
  }, []);

  /** 发表评论（本地立即追加，保证响应感） */
  const createComment = useCallback(async (postId, content) => {
    const res = await fetch(`/api/community/posts/${postId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error('create_comment_failed');
    const comment = (await res.json()).data;
    setState(prev => {
      const existing = prev.commentsByPost[postId] || [];
      return { ...prev, commentsByPost: { ...prev.commentsByPost, [postId]: [...existing, comment] } };
    });
    return comment;
  }, []);

  /** 关注某人 */
  const follow = useCallback(async (userId) => {
    const res = await fetch(`/api/community/members/${userId}/follow`, { method: 'POST' });
    if (!res.ok) throw new Error('follow_failed');
    const data = (await res.json()).data;
    // 更新 memberCache 中此人的 isFollowing
    setState(prev => ({
      ...prev,
      memberCache: {
        ...prev.memberCache,
        [userId]: { ...(prev.memberCache[userId] || {}), isFollowing: true },
      },
    }));
    return data;
  }, []);

  /** 取消关注 */
  const unfollow = useCallback(async (userId) => {
    const res = await fetch(`/api/community/members/${userId}/follow`, { method: 'DELETE' });
    if (!res.ok) throw new Error('unfollow_failed');
    const data = (await res.json()).data;
    setState(prev => ({
      ...prev,
      memberCache: {
        ...prev.memberCache,
        [userId]: { ...(prev.memberCache[userId] || {}), isFollowing: false },
      },
    }));
    return data;
  }, []);

  /** 拉取成员资料（含 isFollowing + 关注统计），缓存到 memberCache */
  const fetchMember = useCallback(async (userId) => {
    const res = await fetch(`/api/community/members/${userId}`);
    if (!res.ok) throw new Error('fetch_member_failed');
    const member = (await res.json()).data;
    setState(prev => ({ ...prev, memberCache: { ...prev.memberCache, [userId]: member } }));
    return member;
  }, []);

  /** 拉取某用户的帖子 timeline */
  const fetchUserPosts = useCallback(async (userId, { cursor = null, limit = 20 } = {}) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor !== null) params.set('cursor', String(cursor));
    const res = await fetch(`/api/community/members/${userId}/posts?${params}`);
    if (!res.ok) throw new Error('fetch_user_posts_failed');
    return (await res.json()).data;
  }, []);

  /** 拉取关注流（我关注的人的帖子） */
  const fetchFollowingFeed = useCallback(async ({ cursor = null, limit = 20 } = {}) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor !== null) params.set('cursor', String(cursor));
    const res = await fetch(`/api/community/feed/following?${params}`);
    if (!res.ok) throw new Error('fetch_following_feed_failed');
    const posts = (await res.json()).data;
    setState(prev => ({
      ...prev,
      followingFeed: cursor === null ? posts : [...prev.followingFeed, ...posts],
    }));
    return posts;
  }, []);

  /** 拉取某用户的粉丝列表 */
  const fetchFollowers = useCallback(async (userId) => {
    const res = await fetch(`/api/community/members/${userId}/followers`);
    if (!res.ok) throw new Error('fetch_followers_failed');
    return (await res.json()).data;
  }, []);

  /** 拉取某用户关注的人列表 */
  const fetchFollowing = useCallback(async (userId) => {
    const res = await fetch(`/api/community/members/${userId}/following`);
    if (!res.ok) throw new Error('fetch_following_failed');
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

  /** 收到新评论（community:comment-new）— 加通知 + 若评论已展开则追加 */
  const onCommentNew = useCallback((comment) => {
    setState(prev => {
      const postId = comment?.parentId;
      const alreadyExpanded = postId != null && prev.commentsByPost[postId] != null;
      return {
        ...prev,
        commentsByPost: alreadyExpanded
          ? { ...prev.commentsByPost, [postId]: [...(prev.commentsByPost[postId] || []), comment] }
          : prev.commentsByPost,
        notifications: [
          { type: 'comment-new', comment, at: Date.now() },
          ...prev.notifications,
        ].slice(0, 50),
      };
    });
  }, []);

  /** 收到被关注（community:follow）— 加通知 */
  const onFollow = useCallback((payload) => {
    setState(prev => ({
      ...prev,
      notifications: [
        { type: 'follow', payload, at: Date.now() },
        ...prev.notifications,
      ].slice(0, 50),
    }));
  }, []);

  /** 收到房间状态更新（room:state）— 更新当前房间状态 */
  const onRoomState = useCallback((payload) => {
    setState(prev => ({ ...prev, roomState: payload }));
  }, []);

  // ── 私信 DM / agent DM HTTP 方法 ─────────────────────────
  /** 开启/复用与某人的会话（agent=true 与对端 agent 私信）。返回 thread（含 peer 昵称/头像）。 */
  const openDm = useCallback(async (otherUserId, agent = false) => {
    const res = await fetch('/api/community/dm/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otherUserId, agent }),
    });
    if (!res.ok) throw new Error('open_dm_failed');
    const thread = (await res.json()).data;
    setState(prev => ({
      ...prev,
      dmThreads: prev.dmThreads.some(t => t.id === thread.id)
        ? prev.dmThreads.map(t => t.id === thread.id ? thread : t)
        : [thread, ...prev.dmThreads],
    }));
    return thread;
  }, []);

  /** 拉我的会话列表 */
  const fetchDmThreads = useCallback(async () => {
    const res = await fetch('/api/community/dm/threads');
    if (!res.ok) throw new Error('fetch_dm_threads_failed');
    const threads = (await res.json()).data;
    updateState({ dmThreads: threads });
    return threads;
  }, [updateState]);

  /** 拉某会话消息，缓存到 dmMessagesByThread */
  const fetchDmMessages = useCallback(async (threadId) => {
    const res = await fetch(`/api/community/dm/${threadId}/messages`);
    if (!res.ok) throw new Error('fetch_dm_messages_failed');
    const { messages } = (await res.json()).data;
    setState(prev => ({ ...prev, dmMessagesByThread: { ...prev.dmMessagesByThread, [threadId]: messages } }));
    return messages;
  }, []);

  /** 发送消息。agent 会话后端会同步返回 agentReply。 */
  const sendDm = useCallback(async (threadId, content) => {
    const res = await fetch(`/api/community/dm/${threadId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error('send_dm_failed');
    const data = (await res.json()).data;
    const { message, agentReply } = data;
    const append = (id, msgs) => [...(msgs || []), ...(msgs && msgs.some(m => m.id === message.id) ? [] : [message]), ...(agentReply && (msgs || []).every(m => m.id !== agentReply.id) ? [agentReply] : [])];
    setState(prev => ({
      ...prev,
      dmMessagesByThread: { ...prev.dmMessagesByThread, [threadId]: append(threadId, prev.dmMessagesByThread[threadId]) },
      dmThreads: prev.dmThreads.map(t => t.id === threadId
        ? { ...t, lastMessage: agentReply ? agentReply.content : message.content, lastSenderUserId: message.senderUserId, lastMessageAt: Date.now() }
        : t),
    }));
    return data;
  }, []);

  /** 收到新私信/agent 私信（community:dm-new，定向）。缓存消息 + 刷新会话列表。 */
  const onDmNew = useCallback(({ threadId, message }) => {
    const numThreadId = Number(threadId);
    setState(prev => {
      // 消息去重后追加
      let dmMessagesByThread = prev.dmMessagesByThread;
      if (prev.dmMessagesByThread[numThreadId] != null) {
        const existing = prev.dmMessagesByThread[numThreadId];
        if (!existing.some(m => m.id === message?.id)) {
          dmMessagesByThread = { ...prev.dmMessagesByThread, [numThreadId]: [...existing, message] };
        }
      }
      // 有会话则更新 lastMessage，并置顶；无则触发一次线程刷新（后续也可手动拉）
      const hasThread = prev.dmThreads.some(t => t.id === numThreadId);
      const dmThreads = hasThread
        ? prev.dmThreads.map(t => t.id === numThreadId
            ? { ...t, lastMessage: message?.content ?? t.lastMessage, lastMessageAt: Date.now() }
            : t)
        : prev.dmThreads;
      return { ...prev, dmMessagesByThread, dmThreads };
    });
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
    createMember, updateMemberProfile, updateAvatar, updateSelfTags, fetchSimilarMembers, refreshProfile, createPost, fetchFeed, likePost, likeSong,
    fetchInbox, fetchClusters, triggerAgentComment, updateAgentConfig,
    // F9 invitation http
    invite, respondInvitation, fetchInvitations, bringPlaylist,
    // 社交：评论 / 关注 / 成员主页 / timeline / 关注流
    fetchComments, createComment, follow, unfollow,
    fetchMember, fetchUserPosts, fetchFollowingFeed, fetchFollowers, fetchFollowing,
    // F5 room http
    fetchRooms, createRoom, joinRoomHttp, endRoom,
    // DM http + handler
    openDm, fetchDmThreads, fetchDmMessages, sendDm, onDmNew,
    // socket event handlers
    onPostNew, onAgentComment, onPush, onClusterUpdated, onInvitation,
    onCommentNew, onFollow, onRoomState,
    clearNotifications,
  };

  return <CommunityContext.Provider value={value}>{children}</CommunityContext.Provider>;
}

export function useCommunity() {
  const ctx = useContext(CommunityContext);
  if (!ctx) throw new Error('useCommunity must be used within CommunityProvider');
  return ctx;
}
