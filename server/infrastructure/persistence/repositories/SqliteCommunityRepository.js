/**
 * SqliteCommunityRepository — CommunityRepository 的 SQLite(sql.js) 实现。
 *
 * 用 db/schema.js 的 queryAll/queryOne/execute 三个 helper（依赖注入，便于测试）。
 * DO（snake_case 行）→ DTO（camelCase）转换在此层完成，不外泄表结构（模型不透传）。
 */
import { queryAll, queryOne, execute } from '../../../db/schema.js';

function parseJsonArray(raw) {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function toMember(row) {
  if (!row) return null;
  return {
    userId: String(row.user_id),
    nickname: row.nickname || '',
    avatarUrl: row.avatar_url || '',
    joinedAt: row.joined_at,
    lastActiveAt: row.last_active_at || null,
    clusterId: row.cluster_id === null || row.cluster_id === undefined ? null : Number(row.cluster_id),
    selfTags: parseJsonArray(row.self_tags),
  };
}

function toPost(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    userId: String(row.user_id),
    type: row.type,
    parentId: row.parent_id === null || row.parent_id === undefined ? null : Number(row.parent_id),
    content: row.content,
    songId: row.song_id || null,
    playlistId: row.playlist_id || null,
    songTitle: row.song_title || null,
    cover: row.cover || null,
    autoTags: parseJsonArray(row.auto_tags),
    likes: Number(row.likes) || 0,
    isAgent: Number(row.is_agent) === 1,
    agentAuthorUserId: row.agent_author_user_id || null,
    createdAt: row.created_at,
  };
}

function toInvitation(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    fromUserId: String(row.from_user_id),
    toUserId: String(row.to_user_id),
    contextType: row.context_type || 'feed',
    contextId: row.context_id || null,
    status: row.status || 'pending',
    createdAt: row.created_at,
  };
}

function toRoom(row) {
  if (!row) return null;
  return {
    roomId: String(row.room_id),
    hostUserId: String(row.host_user_id),
    name: row.name || '',
    topicTags: parseJsonArray(row.topic_tags),
    status: Number(row.active) === 1 ? 'active' : 'ended',
    createdAt: row.created_at,
  };
}

function toDmThread(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    userA: String(row.user_a),
    userB: String(row.user_b),
    agentAuthorUserId: row.agent_author_user_id || null,
    lastMessageAt: row.last_message_at || null,
    lastMessage: row.last_message || null,
    lastSenderUserId: row.last_sender ? String(row.last_sender) : null,
    createdAt: row.created_at,
  };
}

function toDmMessage(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    threadId: Number(row.thread_id),
    senderUserId: String(row.sender_user_id),
    isAgent: Number(row.is_agent) === 1,
    content: row.content,
    createdAt: row.created_at,
  };
}

/**
 * @param {object} [deps] — 可注入 db helpers（测试用）
 */
export function createSqliteCommunityRepository(deps = { queryAll, queryOne, execute }) {
  const q = deps.queryAll || queryAll;
  const one = deps.queryOne || queryOne;
  const run = deps.execute || execute;

  // 给帖子/评论补作者展示字段（昵称/头像），仅读公开字段
  const enrichAuthors = (items) => {
    if (!Array.isArray(items) || items.length === 0) return items;
    const ids = [...new Set(items.map((p) => String(p.userId)).filter(Boolean))];
    if (ids.length === 0) return items;
    const rows = q(
      `SELECT user_id, nickname, avatar_url FROM community_members WHERE user_id IN (${ids.map(() => '?').join(',')})`,
      ids
    );
    const byId = new Map(rows.map((r) => [String(r.user_id), r]));
    const out = items.map((p) => {
      const m = byId.get(String(p.userId));
      if (!m) return p;
      return {
        ...p,
        nickname: p.nickname || m.nickname || '',
        avatarUrl: p.avatarUrl || m.avatar_url || '',
      };
    });
    return out;
  };
  const enrichPost = (post) => (post ? enrichAuthors([post])[0] : null);

  return {
    /**
     * 在仓储方法上包装作者信息注入（DDD read-model：帖子 DTO 附带作者昵称/头像）。
     */
    withAuthors(fn) {
      return (...args) => enrichAuthors(fn(...args));
    },

    createMember({ userId, nickname, avatarUrl }) {
      run(
        `INSERT INTO community_members (user_id, nickname, avatar_url) VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET nickname=excluded.nickname, avatar_url=excluded.avatar_url`,
        [String(userId), nickname || '', avatarUrl || '']
      );
      return toMember(one('SELECT * FROM community_members WHERE user_id = ?', [String(userId)]));
    },

    getMember(userId) {
      return toMember(one('SELECT * FROM community_members WHERE user_id = ?', [String(userId)]));
    },

    updateMemberProfile(userId, { nickname, avatarUrl } = {}) {
      run(
        'UPDATE community_members SET nickname = ?, avatar_url = ? WHERE user_id = ?',
        [nickname || '', avatarUrl || '', String(userId)]
      );
      return toMember(one('SELECT * FROM community_members WHERE user_id = ?', [String(userId)]));
    },

    saveAvatar(userId, binary, mimeType) {
      run(
        'UPDATE community_members SET avatar_binary = ?, avatar_mime = ?, avatar_url = ? WHERE user_id = ?',
        [binary, mimeType || 'image/png', `/api/community/members/${String(userId)}/avatar`, String(userId)]
      );
      return toMember(one('SELECT * FROM community_members WHERE user_id = ?', [String(userId)]));
    },

    getAvatarBinary(userId) {
      return one('SELECT avatar_binary, avatar_mime FROM community_members WHERE user_id = ?', [String(userId)]);
    },

    touchMemberActive(userId) {
      run('UPDATE community_members SET last_active_at = CURRENT_TIMESTAMP WHERE user_id = ?', [String(userId)]);
    },

    setMemberCluster(userId, clusterId) {
      run('UPDATE community_members SET cluster_id = ? WHERE user_id = ?', [Number(clusterId), String(userId)]);
    },

    setMemberSelfTags(userId, selfTags) {
      run('UPDATE community_members SET self_tags = ? WHERE user_id = ?', [
        JSON.stringify(Array.isArray(selfTags) ? selfTags : []),
        String(userId),
      ]);
    },

    upsertMemberAuth({ userId, neteaseUid, cookieEncrypted }) {
      run(
        `INSERT INTO community_member_netease_auth (user_id, netease_uid, cookie_encrypted, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(user_id) DO UPDATE SET netease_uid=excluded.netease_uid,
           cookie_encrypted=excluded.cookie_encrypted, updated_at=CURRENT_TIMESTAMP`,
        [String(userId), String(neteaseUid), cookieEncrypted]
      );
    },

    getMemberAuth(userId) {
      const row = one('SELECT * FROM community_member_netease_auth WHERE user_id = ?', [String(userId)]);
      if (!row) return null;
      return {
        userId: String(row.user_id),
        neteaseUid: String(row.netease_uid),
        cookieEncrypted: row.cookie_encrypted,
        fetchedAt: row.fetched_at || null,
      };
    },

    touchMemberAuthFetched(userId) {
      run('UPDATE community_member_netease_auth SET fetched_at = CURRENT_TIMESTAMP WHERE user_id = ?', [String(userId)]);
    },

    recordListen({ userId, songId, title, artist, action }) {
      run(
        `INSERT INTO community_listens (user_id, song_id, title, artist, action) VALUES (?, ?, ?, ?, ?)`,
        [String(userId), songId || '', title || '', artist || '', action || '']
      );
    },

    createPost(post) {
      const {
        userId, type, content, parentId, songId, playlistId,
        autoTags, isAgent, agentAuthorUserId, songTitle, cover,
      } = post;
      run(
        `INSERT INTO community_posts
           (user_id, type, parent_id, content, song_id, playlist_id, song_title, cover, auto_tags, is_agent, agent_author_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          String(userId), type,
          parentId === null || parentId === undefined ? null : Number(parentId),
          content,
          songId || null, playlistId || null,
          songTitle || null, cover || null,
          JSON.stringify(Array.isArray(autoTags) ? autoTags : []),
          isAgent ? 1 : 0,
          agentAuthorUserId || null,
        ]
      );
      const row = one('SELECT * FROM community_posts WHERE rowid = last_insert_rowid()');
      return Number(row.id);
    },

    getPost(id) {
      return enrichPost(toPost(one('SELECT * FROM community_posts WHERE id = ?', [Number(id)])));
    },

    listFeed({ limit, cursor } = {}) {
      const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);
      if (cursor === null || cursor === undefined) {
        return enrichAuthors(
          q(
            `SELECT * FROM community_posts WHERE parent_id IS NULL ORDER BY id DESC LIMIT ?`,
            [lim]
          ).map(toPost)
        );
      }
      return enrichAuthors(
        q(
          `SELECT * FROM community_posts WHERE parent_id IS NULL AND id < ? ORDER BY id DESC LIMIT ?`,
          [Number(cursor), lim]
        ).map(toPost)
      );
    },

    listComments(parentId) {
      return enrichAuthors(
        q(
          `SELECT * FROM community_posts WHERE parent_id = ? ORDER BY id ASC`,
          [Number(parentId)]
        ).map(toPost)
      );
    },

    likePost(id) {
      run('UPDATE community_posts SET likes = likes + 1 WHERE id = ?', [Number(id)]);
    },

    listListensByUser(userId, limit = 500) {
      const lim = Math.min(Math.max(Number(limit) || 500, 1), 5000);
      const rows = q(
        `SELECT action, artist, played_at FROM community_listens WHERE user_id = ? ORDER BY id DESC LIMIT ?`,
        [String(userId), lim]
      );
      return rows.map((r) => ({
        action: r.action,
        artist: r.artist || '',
        playedAt: r.played_at,
      }));
    },

    saveProfile(userId, profile) {
      run(
        `INSERT INTO community_profiles (user_id, profile_json, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(user_id) DO UPDATE SET profile_json=excluded.profile_json, updated_at=CURRENT_TIMESTAMP`,
        [String(userId), JSON.stringify(profile)]
      );
    },

    getProfile(userId) {
      const row = one('SELECT profile_json FROM community_profiles WHERE user_id = ?', [String(userId)]);
      if (!row) return null;
      try {
        return JSON.parse(row.profile_json);
      } catch {
        return null;
      }
    },

    listAllProfiles() {
      const rows = q('SELECT user_id, profile_json FROM community_profiles', []);
      const out = [];
      for (const r of rows) {
        try {
          out.push({ userId: String(r.user_id), profile: JSON.parse(r.profile_json) });
        } catch {
          /* skip corrupt */
        }
      }
      return out;
    },

    saveClusterSnapshot(clusters) {
      run('DELETE FROM community_clusters', []);
      const list = Array.isArray(clusters) ? clusters : [];
      for (const c of list) {
        run(
          `INSERT INTO community_clusters (cluster_id, label, centroid, member_count, updated_at)
           VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [Number(c.clusterId), c.label || '', JSON.stringify(c.centroid || {}), Number(c.memberCount) || 0]
        );
      }
    },

    getClusterSnapshot() {
      const rows = q('SELECT * FROM community_clusters', []);
      return rows.map((r) => {
        let centroid;
        try { centroid = JSON.parse(r.centroid); } catch { centroid = {}; }
        // memberUserIds 从 community_members 按 cluster_id 反查
        const members = q('SELECT user_id FROM community_members WHERE cluster_id = ?', [Number(r.cluster_id)]);
        return {
          clusterId: Number(r.cluster_id),
          label: r.label || '',
          centroid,
          memberCount: Number(r.member_count) || 0,
          memberUserIds: members.map((m) => String(m.user_id)),
        };
      });
    },

    /**
     * 列出指定簇的成员（含 nickname/avatar/selfTags，给 GET /clusters/:id/members 用）。
     * 不返回 cookie 类敏感字段。
     */
    listClusterMembers(clusterId) {
      return q(
        `SELECT user_id, nickname, avatar_url, joined_at, last_active_at, cluster_id, self_tags
         FROM community_members WHERE cluster_id = ? ORDER BY joined_at ASC`,
        [Number(clusterId)]
      ).map((r) => ({
        userId: String(r.user_id),
        nickname: r.nickname || '',
        avatarUrl: r.avatar_url || '',
        joinedAt: r.joined_at,
        lastActiveAt: r.last_active_at || null,
        clusterId: r.cluster_id === null || r.cluster_id === undefined ? null : Number(r.cluster_id),
        selfTags: parseJsonArray(r.self_tags),
      }));
    },

    createInbox(entry) {
      run(
        `INSERT INTO community_inbox (user_id, target_type, target_id, from_cluster, reason)
         VALUES (?, ?, ?, ?, ?)`,
        [
          String(entry.userId),
          entry.targetType,
          String(entry.targetId),
          entry.fromCluster === null || entry.fromCluster === undefined ? null : Number(entry.fromCluster),
          entry.reason || null,
        ]
      );
      const row = one('SELECT id FROM community_inbox WHERE rowid = last_insert_rowid()');
      return Number(row.id);
    },

    listInbox(userId) {
      return q(
        `SELECT * FROM community_inbox WHERE user_id = ? ORDER BY id DESC LIMIT 100`,
        [String(userId)]
      ).map((r) => ({
        id: Number(r.id),
        userId: String(r.user_id),
        targetType: r.target_type,
        targetId: String(r.target_id),
        fromCluster: r.from_cluster === null || r.from_cluster === undefined ? null : Number(r.from_cluster),
        reason: r.reason,
        read: Number(r.read) === 1,
        createdAt: r.created_at,
      }));
    },

    hasInboxRecently(userId, targetType, targetId) {
      const row = one(
        `SELECT id FROM community_inbox
         WHERE user_id = ? AND target_type = ? AND target_id = ?
           AND created_at >= datetime('now','-1 day')
         LIMIT 1`,
        [String(userId), targetType, String(targetId)]
      );
      return !!row;
    },

    getMemberAgentConfig(userId) {
      const row = one('SELECT * FROM community_member_agent_config WHERE user_id = ?', [String(userId)]);
      if (!row) return null;
      let rules;
      try { rules = JSON.parse(row.rules_json); } catch { rules = {}; }
      return { userId: String(row.user_id), rules, personaSnapshot: row.persona_snapshot || null };
    },

    upsertMemberAgentConfig(userId, rules, personaSnapshot) {
      run(
        `INSERT INTO community_member_agent_config (user_id, rules_json, persona_snapshot, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(user_id) DO UPDATE SET rules_json=excluded.rules_json,
           persona_snapshot=excluded.persona_snapshot, updated_at=CURRENT_TIMESTAMP`,
        [String(userId), JSON.stringify(rules || {}), personaSnapshot || null]
      );
    },

    createInvitation(inv) {
      run(
        `INSERT INTO community_invitations (from_user_id, to_user_id, context_type, context_id, status)
         VALUES (?, ?, ?, ?, ?)`,
        [String(inv.fromUserId), String(inv.toUserId), inv.contextType || 'feed', inv.contextId || null, inv.status || 'pending']
      );
      const row = one('SELECT * FROM community_invitations WHERE rowid = last_insert_rowid()');
      return toInvitation(row);
    },

    getInvitation(id) {
      return toInvitation(one('SELECT * FROM community_invitations WHERE id = ?', [Number(id)]));
    },

    listInvitations(userId) {
      return q(
        `SELECT * FROM community_invitations WHERE from_user_id = ? OR to_user_id = ? ORDER BY id DESC LIMIT 100`,
        [String(userId), String(userId)]
      ).map(toInvitation);
    },

    updateInvitationStatus(id, status) {
      run('UPDATE community_invitations SET status = ? WHERE id = ?', [status, Number(id)]);
    },

    createRoom({ roomId, hostUserId, name, topicTags }) {
      run(
        `INSERT INTO community_rooms (room_id, host_user_id, name, topic_tags, active)
         VALUES (?, ?, ?, ?, 1)`,
        [String(roomId), String(hostUserId), name || '', JSON.stringify(Array.isArray(topicTags) ? topicTags : [])]
      );
      return toRoom(one('SELECT * FROM community_rooms WHERE room_id = ?', [String(roomId)]));
    },

    getRoom(roomId) {
      return toRoom(one('SELECT * FROM community_rooms WHERE room_id = ?', [String(roomId)]));
    },

    listRooms(activeOnly = true) {
      const sql = activeOnly
        ? 'SELECT * FROM community_rooms WHERE active = 1 ORDER BY created_at DESC LIMIT 100'
        : 'SELECT * FROM community_rooms ORDER BY created_at DESC LIMIT 100';
      return q(sql, []).map(toRoom);
    },

    endRoom(roomId) {
      run('UPDATE community_rooms SET active = 0 WHERE room_id = ?', [String(roomId)]);
    },

    // ── 社交关系：点赞记录（谁赞过 / 幂等 toggle / 计数同步） ─────
    toggleLike(userId, postId) {
      const post = one('SELECT id, likes FROM community_posts WHERE id = ?', [Number(postId)]);
      if (!post) return null;
      const existing = one(
        'SELECT user_id FROM community_likes WHERE user_id = ? AND post_id = ?',
        [String(userId), Number(postId)]
      );
      if (existing) {
        run('DELETE FROM community_likes WHERE user_id = ? AND post_id = ?', [String(userId), Number(postId)]);
        run('UPDATE community_posts SET likes = MAX(0, likes - 1) WHERE id = ?', [Number(postId)]);
        return { liked: false, likes: Math.max(0, Number(post.likes) - 1) };
      }
      run('INSERT OR IGNORE INTO community_likes (user_id, post_id) VALUES (?, ?)', [String(userId), Number(postId)]);
      run('UPDATE community_posts SET likes = likes + 1 WHERE id = ?', [Number(postId)]);
      return { liked: true, likes: Number(post.likes) + 1 };
    },

    hasLiked(userId, postId) {
      const row = one(
        'SELECT user_id FROM community_likes WHERE user_id = ? AND post_id = ?',
        [String(userId), Number(postId)]
      );
      return !!row;
    },

    listLikers(postId) {
      return q(
        `SELECT m.user_id, m.nickname, m.avatar_url, m.cluster_id, m.self_tags
         FROM community_likes l
         JOIN community_members m ON m.user_id = l.user_id
         WHERE l.post_id = ?
         ORDER BY l.created_at DESC`,
        [Number(postId)]
      ).map((r) => ({
        userId: String(r.user_id),
        nickname: r.nickname || '',
        avatarUrl: r.avatar_url || '',
        clusterId: r.cluster_id === null || r.cluster_id === undefined ? null : Number(r.cluster_id),
        selfTags: parseJsonArray(r.self_tags),
      }));
    },

    // ── 社交关系：关注图谱（follower / followee） ────────────
    follow(followerId, followeeId) {
      run(
        'INSERT OR IGNORE INTO community_follows (follower_id, followee_id) VALUES (?, ?)',
        [String(followerId), String(followeeId)]
      );
      return { ok: true, following: true };
    },

    unfollow(followerId, followeeId) {
      run(
        'DELETE FROM community_follows WHERE follower_id = ? AND followee_id = ?',
        [String(followerId), String(followeeId)]
      );
      return { ok: true, following: false };
    },

    isFollowing(followerId, followeeId) {
      const row = one(
        'SELECT follower_id FROM community_follows WHERE follower_id = ? AND followee_id = ?',
        [String(followerId), String(followeeId)]
      );
      return !!row;
    },

    listFollowers(userId) {
      return q(
        `SELECT m.user_id, m.nickname, m.avatar_url, m.cluster_id, m.self_tags
         FROM community_follows f
         JOIN community_members m ON m.user_id = f.follower_id
         WHERE f.followee_id = ?
         ORDER BY f.created_at DESC`,
        [String(userId)]
      ).map((r) => ({
        userId: String(r.user_id),
        nickname: r.nickname || '',
        avatarUrl: r.avatar_url || '',
        clusterId: r.cluster_id === null || r.cluster_id === undefined ? null : Number(r.cluster_id),
        selfTags: parseJsonArray(r.self_tags),
      }));
    },

    listFollowing(userId) {
      return q(
        `SELECT m.user_id, m.nickname, m.avatar_url, m.cluster_id, m.self_tags
         FROM community_follows f
         JOIN community_members m ON m.user_id = f.followee_id
         WHERE f.follower_id = ?
         ORDER BY f.created_at DESC`,
        [String(userId)]
      ).map((r) => ({
        userId: String(r.user_id),
        nickname: r.nickname || '',
        avatarUrl: r.avatar_url || '',
        clusterId: r.cluster_id === null || r.cluster_id === undefined ? null : Number(r.cluster_id),
        selfTags: parseJsonArray(r.self_tags),
      }));
    },

    // ── 用户 timeline + 关注流（社交发现核心查询） ───────────
    listPostsByUser(userId, { limit, cursor } = {}) {
      const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);
      if (cursor === null || cursor === undefined) {
        return enrichAuthors(
          q(
            `SELECT * FROM community_posts WHERE user_id = ? AND parent_id IS NULL ORDER BY id DESC LIMIT ?`,
            [String(userId), lim]
          ).map(toPost)
        );
      }
      return enrichAuthors(
        q(
          `SELECT * FROM community_posts WHERE user_id = ? AND parent_id IS NULL AND id < ? ORDER BY id DESC LIMIT ?`,
          [String(userId), Number(cursor), lim]
        ).map(toPost)
      );
    },

    listFeedFromFollowing(userId, { limit, cursor } = {}) {
      const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);
      const subWhere = `p.parent_id IS NULL
             AND p.user_id IN (SELECT followee_id FROM community_follows WHERE follower_id = ?)`;
      if (cursor === null || cursor === undefined) {
        return enrichAuthors(
          q(
            `SELECT p.* FROM community_posts p WHERE ${subWhere} ORDER BY p.id DESC LIMIT ?`,
            [String(userId), lim]
          ).map(toPost)
        );
      }
      return enrichAuthors(
        q(
          `SELECT p.* FROM community_posts p WHERE ${subWhere} AND p.id < ? ORDER BY p.id DESC LIMIT ?`,
          [String(userId), Number(cursor), lim]
        ).map(toPost)
      );
    },

    // ── 私信 / agent 私信（DM）─────────────────────────────
    getOrCreateDmThread({ userA, userB, agentAuthorUserId }) {
      const key = `${String(userA)}\u0000${String(userB)}`;
      run(
        `INSERT INTO community_dm_threads (thread_key, user_a, user_b, agent_author_user_id)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(thread_key) DO UPDATE SET agent_author_user_id = excluded.agent_author_user_id`,
        [key, String(userA), String(userB), agentAuthorUserId || null]
      );
      return toDmThread(one('SELECT * FROM community_dm_threads WHERE thread_key = ?', [key]));
    },

    getDmThread(id) {
      return toDmThread(one('SELECT * FROM community_dm_threads WHERE id = ?', [Number(id)]));
    },

    listDmThreads(userId) {
      const rows = q(
        `SELECT t.*,
            (SELECT m.content FROM community_dm_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_message,
            (SELECT m.sender_user_id FROM community_dm_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_sender
         FROM community_dm_threads t
         WHERE t.user_a = ? OR t.user_b = ?
         ORDER BY COALESCE(t.last_message_at, t.created_at) DESC`,
        [String(userId), String(userId)]
      );
      return rows.map(toDmThread);
    },

    listDmMessages(threadId, limit) {
      const numThread = Number(threadId);
      // 传 limit 时取「最近 N 条」并按时间正序返回（供 agent 上下文 / 最近消息）
      if (limit) {
        const lim = Math.min(Math.max(Number(limit), 1), 200);
        return q(
          `SELECT * FROM community_dm_messages WHERE thread_id = ? ORDER BY id DESC LIMIT ?`,
          [numThread, lim]
        ).reverse().map(toDmMessage);
      }
      return q(
        `SELECT * FROM community_dm_messages WHERE thread_id = ? ORDER BY id ASC`,
        [numThread]
      ).map(toDmMessage);
    },

    createDmMessage({ threadId, senderUserId, isAgent, content }) {
      run(
        `INSERT INTO community_dm_messages (thread_id, sender_user_id, is_agent, content) VALUES (?, ?, ?, ?)`,
        [Number(threadId), String(senderUserId), isAgent ? 1 : 0, content]
      );
      const row = one('SELECT * FROM community_dm_messages WHERE rowid = last_insert_rowid()');
      return Number(row.id);
    },

    getDmMessage(id) {
      return toDmMessage(one('SELECT * FROM community_dm_messages WHERE id = ?', [Number(id)]));
    },

    touchDmThreadLastMessage(threadId) {
      run('UPDATE community_dm_threads SET last_message_at = CURRENT_TIMESTAMP WHERE id = ?', [Number(threadId)]);
    },
  };
}

export const sqliteCommunityRepository = createSqliteCommunityRepository();
