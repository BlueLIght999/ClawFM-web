import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import initSqlJs from 'sql.js';
import { createSqliteCommunityRepository } from '../infrastructure/persistence/repositories/SqliteCommunityRepository.js';

function makeHelpers(db) {
  const queryAll = (sql, params = []) => {
    const s = db.prepare(sql);
    s.bind(params);
    const rows = [];
    while (s.step()) rows.push(s.getAsObject());
    s.free();
    return rows;
  };
  const queryOne = (sql, params = []) => {
    const s = db.prepare(sql);
    s.bind(params);
    let r = null;
    if (s.step()) r = s.getAsObject();
    s.free();
    return r;
  };
  const execute = (sql, params = []) => {
    db.run(sql, params);
  };
  return { queryAll, queryOne, execute };
}

const DDL = `
CREATE TABLE community_members (
  user_id TEXT PRIMARY KEY, nickname TEXT, avatar_url TEXT,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP, last_active_at DATETIME,
  cluster_id INTEGER, self_tags TEXT
);
CREATE TABLE community_member_netease_auth (
  user_id TEXT PRIMARY KEY, netease_uid TEXT NOT NULL, cookie_encrypted TEXT NOT NULL,
  fetched_at DATETIME, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE community_listens (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL,
  song_id TEXT, title TEXT, artist TEXT, action TEXT NOT NULL,
  played_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE community_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, type TEXT NOT NULL,
  parent_id INTEGER, content TEXT NOT NULL, song_id TEXT, playlist_id TEXT,
  song_title TEXT, cover TEXT, auto_tags TEXT, likes INTEGER DEFAULT 0,
  is_agent INTEGER DEFAULT 0, agent_author_user_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE community_inbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, target_type TEXT NOT NULL,
  target_id TEXT NOT NULL, from_cluster INTEGER, reason TEXT, summary TEXT,
  read INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE community_dm_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT, thread_key TEXT NOT NULL UNIQUE,
  user_a TEXT NOT NULL, user_b TEXT NOT NULL, agent_author_user_id TEXT,
  last_message_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE community_dm_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, thread_id INTEGER NOT NULL,
  sender_user_id TEXT NOT NULL, is_agent INTEGER DEFAULT 0,
  content TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

let SQL;
beforeAll(async () => {
  SQL = await initSqlJs();
});

let repo;
let helpers;
beforeEach(() => {
  // 每个测试独立内存 db，互不污染
  const db = new SQL.Database();
  db.run(DDL);
  helpers = makeHelpers(db);
  repo = createSqliteCommunityRepository(helpers);
});

describe('community sqlite repository', () => {
  it('createMember_insertsAndGetMember_returnsDto', () => {
    repo.createMember({ userId: 'u1', nickname: '阿七', avatarUrl: 'https://x/a.png' });
    const m = repo.getMember('u1');
    expect(m).not.toBeNull();
    expect(m.userId).toBe('u1');
    expect(m.nickname).toBe('阿七');
    expect(m.avatarUrl).toBe('https://x/a.png');
    expect(m.clusterId).toBeNull();
    expect(m.selfTags).toEqual([]);
  });

  it('createMember_upsertsOnConflict', () => {
    repo.createMember({ userId: 'u1', nickname: '旧名', avatarUrl: '' });
    repo.createMember({ userId: 'u1', nickname: '新名', avatarUrl: 'https://x/b.png' });
    const m = repo.getMember('u1');
    expect(m.nickname).toBe('新名');
    expect(m.avatarUrl).toBe('https://x/b.png');
  });

  it('setMemberSelfTags_andGetMemberReflectsTags', () => {
    repo.createMember({ userId: 'u2', nickname: 'u2', avatarUrl: '' });
    repo.setMemberSelfTags('u2', ['通勤', '失恋']);
    expect(repo.getMember('u2').selfTags).toEqual(['通勤', '失恋']);
  });

  it('listMembersWithTags_returnsPublicFieldsInStableUserIdOrder', () => {
    // 顺序是契约：索引构建按这个顺序喂行，抖动会传导到召回结果的稳定性
    repo.createMember({ userId: 'u3', nickname: '丙', avatarUrl: '' });
    repo.createMember({ userId: 'u1', nickname: '甲', avatarUrl: 'https://x/a.png' });
    repo.createMember({ userId: 'u2', nickname: '乙', avatarUrl: '' });
    repo.setMemberSelfTags('u2', ['后摇']);

    const rows = repo.listMembersWithTags();

    expect(rows.map((r) => r.userId)).toEqual(['u1', 'u2', 'u3']);
    expect(rows[1]).toEqual({ userId: 'u2', nickname: '乙', avatarUrl: '', tags: ['后摇'] });
    // 没填标签的成员仍返回（tags 空数组）；是否入索引由服务层决定
    expect(rows[0].tags).toEqual([]);
  });

  it('listMembersWithTags_treatsNullSelfTagsAsEmptyList', () => {
    // 直接写 NULL 列值，模拟建表时未写 self_tags 的历史行
    helpers.queryAll("INSERT INTO community_members (user_id, nickname, avatar_url, self_tags) VALUES ('u9', '玖', '', NULL)");
    const rows = repo.listMembersWithTags();
    expect(rows.map((r) => r.userId)).toEqual(['u9']);
    expect(rows[0].tags).toEqual([]);
  });

  it('setMemberCluster_andTouchActive', () => {
    repo.createMember({ userId: 'u3', nickname: 'u3', avatarUrl: '' });
    repo.setMemberCluster('u3', 2);
    repo.touchMemberActive('u3');
    const m = repo.getMember('u3');
    expect(m.clusterId).toBe(2);
    expect(m.lastActiveAt).not.toBeNull();
  });

  it('upsertMemberAuth_andGetMemberAuth', () => {
    repo.upsertMemberAuth({ userId: 'u1', neteaseUid: '123', cookieEncrypted: 'v1:enc' });
    let auth = repo.getMemberAuth('u1');
    expect(auth.neteaseUid).toBe('123');
    expect(auth.cookieEncrypted).toBe('v1:enc');
    repo.upsertMemberAuth({ userId: 'u1', neteaseUid: '123', cookieEncrypted: 'v1:enc2' });
    auth = repo.getMemberAuth('u1');
    expect(auth.cookieEncrypted).toBe('v1:enc2');
    expect(repo.getMemberAuth('ghost')).toBeNull();
  });

  it('recordListen_doesNotThrow', () => {
    expect(() => repo.recordListen({ userId: 'u1', songId: 's1', title: 't', artist: 'a', action: 'liked' })).not.toThrow();
  });

  it('hasListenAction_findsOnlyThatMembersActionOnThatSong', () => {
    repo.recordListen({ userId: 'u1', songId: 's1', title: 't', artist: 'a', action: 'liked' });
    expect(repo.hasListenAction('u1', 's1', 'liked')).toBe(true);
    expect(repo.hasListenAction('u1', 's1', 'skipped')).toBe(false);
    expect(repo.hasListenAction('u1', 's2', 'liked')).toBe(false);
    expect(repo.hasListenAction('u2', 's1', 'liked')).toBe(false);
  });

  it('createInbox_roundTripsTheSummary', () => {
    repo.createInbox({ userId: 'u1', targetType: 'song', targetId: 's1', fromCluster: 2, reason: 'peer_liked', summary: '晴天 — 周杰伦' });
    repo.createInbox({ userId: 'u1', targetType: 'post', targetId: '7', fromCluster: null, reason: null });
    const [plain, song] = repo.listInbox('u1');
    expect(song).toMatchObject({ targetType: 'song', targetId: 's1', fromCluster: 2, summary: '晴天 — 周杰伦' });
    expect(plain.summary).toBeNull();
  });

  it('createPost_returnsIdAndGetPost_returnsDto', () => {
    const id = repo.createPost({
      userId: 'u1', type: 'reflection', content: '好歌', parentId: null,
      songId: 's1', playlistId: null, autoTags: ['rock', 'night'],
      isAgent: false, agentAuthorUserId: null,
    });
    expect(typeof id).toBe('number');
    const p = repo.getPost(id);
    expect(p.type).toBe('reflection');
    expect(p.content).toBe('好歌');
    expect(p.songId).toBe('s1');
    expect(p.autoTags).toEqual(['rock', 'night']);
    expect(p.isAgent).toBe(false);
    expect(p.likes).toBe(0);
  });

  it('listFeed_returnsTopLevelPostsDescWithCursor', () => {
    const a = repo.createPost({ userId: 'u1', type: 'reflection', content: 'a' });
    const b = repo.createPost({ userId: 'u1', type: 'history', content: 'b' });
    const c = repo.createPost({ userId: 'u1', type: 'recommend', content: 'c', songId: 'sx' });
    const feed = repo.listFeed({ limit: 10 });
    expect(feed.map((p) => p.id)).toEqual([c, b, a]);
    // cursor pagination: take after c
    const page2 = repo.listFeed({ limit: 10, cursor: c });
    expect(page2.map((p) => p.id)).toEqual([b, a]);
  });

  it('listFeed_excludesComments', () => {
    const parent = repo.createPost({ userId: 'u1', type: 'reflection', content: 'parent' });
    repo.createPost({ userId: 'u2', type: 'comment', content: 'reply', parentId: parent });
    const feed = repo.listFeed({ limit: 10 });
    expect(feed.length).toBe(1);
    expect(feed[0].id).toBe(parent);
  });

  it('listComments_returnsCommentsAsc', () => {
    const parent = repo.createPost({ userId: 'u1', type: 'reflection', content: 'p' });
    const c1 = repo.createPost({ userId: 'u2', type: 'comment', content: 'c1', parentId: parent });
    const c2 = repo.createPost({ userId: 'u3', type: 'comment', content: 'c2', parentId: parent });
    expect(repo.listComments(parent).map((c) => c.id)).toEqual([c1, c2]);
  });

  it('likePost_increments', () => {
    const id = repo.createPost({ userId: 'u1', type: 'reflection', content: 'like me' });
    repo.likePost(id);
    repo.likePost(id);
    expect(repo.getPost(id).likes).toBe(2);
  });

  describe('DM / agent DM', () => {
    it('getOrCreateDmThread_reusesOnSameKey_andReturnsDto', () => {
      const t1 = repo.getOrCreateDmThread({ userA: 'u1', userB: 'u2' });
      const t2 = repo.getOrCreateDmThread({ userA: 'u1', userB: 'u2' });
      expect(t2.id).toBe(t1.id);
      expect(t1.userA).toBe('u1');
      expect(t1.userB).toBe('u2');
      expect(t1.agentAuthorUserId).toBeNull();
    });

    it('getOrCreateDmThread_agentSession_setsAgentAuthor', () => {
      const t = repo.getOrCreateDmThread({ userA: 'u1', userB: 'u2', agentAuthorUserId: 'u2' });
      expect(t.agentAuthorUserId).toBe('u2');
    });

    it('createDmMessage_andListDmMessages_roundTrip', () => {
      const t = repo.getOrCreateDmThread({ userA: 'u1', userB: 'u2' });
      const id = repo.createDmMessage({ threadId: t.id, senderUserId: 'u1', isAgent: false, content: 'hi' });
      repo.createDmMessage({ threadId: t.id, senderUserId: 'u2', isAgent: true, content: 'yo' });
      const msgs = repo.listDmMessages(t.id);
      expect(msgs).toHaveLength(2);
      expect(msgs[0].id).toBe(id);
      expect(msgs[1].isAgent).toBe(true);
      expect(repo.getDmMessage(id).content).toBe('hi');
    });

    it('listDmThreads_orderedByRecent_returnsBothSides', () => {
      const t = repo.getOrCreateDmThread({ userA: 'u1', userB: 'u2' });
      repo.createDmMessage({ threadId: t.id, senderUserId: 'u1', isAgent: false, content: 'first' });
      repo.touchDmThreadLastMessage(t.id);
      const mine = repo.listDmThreads('u1');
      const theirs = repo.listDmThreads('u2');
      expect(mine).toHaveLength(1);
      expect(theirs).toHaveLength(1);
      expect(mine[0].lastMessage).toContain('first');
    });
  });
});
