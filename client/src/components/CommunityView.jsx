import { useEffect, useState, useCallback, useMemo } from 'react';
import { useCommunity } from '../contexts/CommunityContext.jsx';
import './community.css';

/**
 * CommunityView — 社区模块入口视图（PRD v0.3 F1-F9）。
 *
 * 视觉：像素风（Press Start 2P + VT323 + 青橙配色 + CRT 扫描线）
 *      + Suno playlist 布局（卡片网格 / 封面 hero / 播放量浮层 / hover 抬升 / 列表行）
 *
 * Tab：feed / compose / inbox / invitations / clusters / rooms / notifications / agent
 */
const TABS = [
  { id: 'feed', label: 'FEED' },
  { id: 'following', label: 'FOLLOWING' },
  { id: 'compose', label: 'POST' },
  { id: 'inbox', label: 'INBOX' },
  { id: 'invitations', label: 'INVS' },
  { id: 'clusters', label: 'CLUSTERS' },
  { id: 'rooms', label: 'ROOMS' },
  { id: 'notifications', label: 'NOTIFY' },
  { id: 'agent', label: 'AGENT' },
];

const POST_TYPES = [
  { value: 'reflection', label: 'Reflection' },
  { value: 'history', label: 'History' },
  { value: 'recommend', label: 'Recommend' },
];

const NOTIFICATION_ICONS = {
  push: '◉',
  'agent-comment': '◈',
  'comment-new': '◈',
  follow: '✛',
  invitation: '✉',
};

export default function CommunityView() {
  const community = useCommunity();
  const {
    currentMember, feed, followingFeed, commentsByPost, memberCache, inbox, clusters, notifications, agentConfig,
    rooms, roomState, invitations, authUid,
    fetchFeed, fetchInbox, fetchClusters, fetchFollowingFeed,
    createPost, likePost, triggerAgentComment, updateAgentConfig,
    createMember, clearNotifications,
    fetchComments, createComment, follow, unfollow, fetchMember,
    fetchRooms, createRoom, joinRoomHttp, endRoom,
    invite, respondInvitation, fetchInvitations, bringPlaylist,
  } = community;

  const [activeTab, setActiveTab] = useState('feed');
  const [error, setError] = useState(null);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [feedCursor, setFeedCursor] = useState(null);
  const [hasMoreFeed, setHasMoreFeed] = useState(true);

  // 首屏拉取公共数据
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const posts = await fetchFeed({ limit: 20 });
        if (cancelled) return;
        setFeedCursor(posts.length > 0 ? posts[posts.length - 1].id : null);
        setHasMoreFeed(posts.length >= 20);
      } catch (e) {
        if (!cancelled) setError(e.message || 'feed_load_failed');
      }
      try {
        await fetchClusters();
      } catch (e) {
        // 非致命
      }
    })();
    return () => { cancelled = true; };
  }, [fetchFeed, fetchClusters]);

  // 切到 inbox 时拉收件箱
  useEffect(() => {
    if (activeTab !== 'inbox' || !currentMember) return;
    fetchInbox(currentMember.userId).catch(e => setError(e.message));
  }, [activeTab, currentMember, fetchInbox]);

  // 切到 rooms 时拉房间列表
  useEffect(() => {
    if (activeTab !== 'rooms') return;
    fetchRooms().catch(e => setError(e.message));
  }, [activeTab, fetchRooms]);

  // 切到 invitations 时拉邀请列表
  useEffect(() => {
    if (activeTab !== 'invitations' || !currentMember) return;
    fetchInvitations(currentMember.userId).catch(e => setError(e.message));
  }, [activeTab, currentMember, fetchInvitations]);

  // 切到 following 时拉关注流
  useEffect(() => {
    if (activeTab !== 'following') return;
    fetchFollowingFeed({ limit: 20 }).catch(e => setError(e.message));
  }, [activeTab, fetchFollowingFeed]);

  const handleLoadMore = useCallback(async () => {
    if (!hasMoreFeed || loadingFeed) return;
    setLoadingFeed(true);
    try {
      const posts = await fetchFeed({ cursor: feedCursor, limit: 20 });
      setFeedCursor(posts.length > 0 ? posts[posts.length - 1].id : feedCursor);
      setHasMoreFeed(posts.length >= 20);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingFeed(false);
    }
  }, [hasMoreFeed, loadingFeed, feedCursor, fetchFeed]);

  const notifyCount = notifications.length;
  const pendingInvitationCount = useMemo(
    () => invitations.filter(inv => inv.status === 'pending').length,
    [invitations],
  );
  const totalLikes = useMemo(
    () => feed.reduce((sum, p) => sum + (p.likes || 0), 0),
    [feed],
  );

  return (
    <div className="community-view">
      {/* Hero 区（Suno playlist hero 风格）*/}
      <div className="community-hero">
        <div className="community-hero-cover">
          {currentMember ? (currentMember.avatarUrl ? '◉' : '♪') : '◆'}
        </div>
        <div className="community-hero-meta">
          <div className="community-hero-label">COMMUNITY</div>
          <div className="community-hero-title">
            {currentMember ? `@${currentMember.nickname || currentMember.userId}` : 'Join the Wave'}
          </div>
          <div className="community-hero-stats">
            <span className="community-hero-stat">
              <span className="community-hero-stat-value">{feed.length}</span> posts
            </span>
            <span className="community-hero-stat">
              <span className="community-hero-stat-value">{clusters.length}</span> clusters
            </span>
            <span className="community-hero-stat">
              <span className="community-hero-stat-value">{totalLikes}</span> likes
            </span>
            {currentMember?.clusterId != null && (
              <span className="community-hero-stat">
                cluster <span className="community-hero-stat-value">#{currentMember.clusterId}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="community-error" role="alert">
          <span>{error}</span>
          <button className="community-btn" style={{ padding: '4px 10px', fontSize: 7 }}
            onClick={() => setError(null)}>DISMISS</button>
        </div>
      )}

      {!currentMember && (
        <JoinHero onCreate={createMember} onError={setError} authUid={authUid} />
      )}

      {/* Tab 导航 */}
      <nav className="community-tabs" aria-label="Community sections">
        {TABS.map(tab => (
          <button
            type="button"
            key={tab.id}
            className={`community-tab${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            aria-pressed={activeTab === tab.id}
          >
            {tab.label}
            {tab.id === 'notifications' && notifyCount > 0 && (
              <span className="community-tab-badge">{notifyCount > 99 ? '99+' : notifyCount}</span>
            )}
            {tab.id === 'invitations' && pendingInvitationCount > 0 && (
              <span className="community-tab-badge">{pendingInvitationCount > 99 ? '99+' : pendingInvitationCount}</span>
            )}
          </button>
        ))}
      </nav>

      {activeTab === 'feed' && (
        <FeedTab
          feed={feed}
          currentMember={currentMember}
          hasMore={hasMoreFeed}
          loadingMore={loadingFeed}
          onLoadMore={handleLoadMore}
          onLike={likePost}
          onTriggerAgentComment={triggerAgentComment}
          onInvite={invite}
          onError={setError}
          commentsByPost={commentsByPost}
          onFetchComments={fetchComments}
          onCreateComment={createComment}
          onFollow={follow}
          onUnfollow={unfollow}
          memberCache={memberCache}
          onFetchMember={fetchMember}
        />
      )}

      {activeTab === 'following' && (
        <FeedTab
          feed={followingFeed}
          currentMember={currentMember}
          hasMore={false}
          loadingMore={false}
          onLoadMore={() => {}}
          onLike={likePost}
          onTriggerAgentComment={triggerAgentComment}
          onInvite={invite}
          onError={setError}
          commentsByPost={commentsByPost}
          onFetchComments={fetchComments}
          onCreateComment={createComment}
          onFollow={follow}
          onUnfollow={unfollow}
          memberCache={memberCache}
          onFetchMember={fetchMember}
          emptyHint="Follow people to see their posts here"
        />
      )}

      {activeTab === 'compose' && (
        <ComposeTab
          currentMember={currentMember}
          onCreate={createPost}
          onError={setError}
        />
      )}

      {activeTab === 'inbox' && (
        <InboxTab inbox={inbox} currentMember={currentMember} />
      )}

      {activeTab === 'invitations' && (
        <InvitationsTab
          invitations={invitations}
          currentMember={currentMember}
          onRespond={respondInvitation}
          onBringPlaylist={bringPlaylist}
          onInvite={invite}
          onError={setError}
        />
      )}

      {activeTab === 'clusters' && (
        <ClustersTab clusters={clusters} currentMember={currentMember} />
      )}

      {activeTab === 'rooms' && (
        <RoomsTab
          rooms={rooms}
          roomState={roomState}
          currentMember={currentMember}
          onCreate={createRoom}
          onJoin={joinRoomHttp}
          onEnd={endRoom}
          onSkip={community.roomSkip}
          onError={setError}
        />
      )}

      {activeTab === 'notifications' && (
        <NotificationsTab
          notifications={notifications}
          onClear={clearNotifications}
        />
      )}

      {activeTab === 'agent' && (
        <AgentTab
          currentMember={currentMember}
          agentConfig={agentConfig}
          onUpdate={updateAgentConfig}
          onError={setError}
        />
      )}
    </div>
  );
}

// ── 加入社区 Hero（Suno CTA 风格）─────────────────────────
function JoinHero({ onCreate, onError, authUid }) {
  const [nickname, setNickname] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleJoin = useCallback(async (e) => {
    e.preventDefault();
    if (!authUid || !nickname.trim()) return;
    setSubmitting(true);
    try {
      await onCreate({ userId: authUid, nickname: nickname.trim() });
    } catch (err) {
      onError(err.message || 'create_member_failed');
    } finally {
      setSubmitting(false);
    }
  }, [authUid, nickname, onCreate, onError]);

  return (
    <form className="community-join-hero" onSubmit={handleJoin}>
      <div className="community-join-hero-icon">◆</div>
      <div className="community-join-hero-body">
        <div className="community-join-hero-title">JOIN COMMUNITY</div>
        <div className="community-join-hero-desc">
          Create your member identity to post, receive pushes, and let your agent speak for you.
        </div>
        <div className="community-join-form">
          <input
            className="community-composer-input"
            type="text"
            placeholder="nickname"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            aria-label="nickname"
            required
          />
          <button
            type="submit"
            className="community-btn community-btn-primary"
            disabled={submitting || !authUid}
          >{submitting ? 'JOINING...' : 'JOIN'}</button>
        </div>
      </div>
    </form>
  );
}

// ── Feed Tab — 卡片网格（Suno trending grid 风格）─────────
function FeedTab({ feed, currentMember, hasMore, loadingMore, onLoadMore, onLike, onTriggerAgentComment, onInvite, onError, commentsByPost, onFetchComments, onCreateComment, onFollow, onUnfollow, memberCache, onFetchMember, emptyHint }) {
  if (!feed || feed.length === 0) {
    return (
      <div className="community-empty">
        <div className="community-empty-icon">♪</div>
        <div>{emptyHint || 'No posts yet'}</div>
      </div>
    );
  }
  return (
    <>
      <div className="community-grid">
        {feed.map(post => (
          <PostCard
            key={post.id}
            post={post}
            currentMember={currentMember}
            onLike={onLike}
            onTriggerAgentComment={onTriggerAgentComment}
            onInvite={onInvite}
            onError={onError}
            comments={commentsByPost?.[post.id]}
            onFetchComments={onFetchComments}
            onCreateComment={onCreateComment}
            onFollow={onFollow}
            onUnfollow={onUnfollow}
            memberCache={memberCache}
            onFetchMember={onFetchMember}
          />
        ))}
      </div>
      {hasMore && (
        <button
          type="button"
          className="community-load-more"
          onClick={onLoadMore}
          disabled={loadingMore}
        >{loadingMore ? 'LOADING...' : 'LOAD MORE'}</button>
      )}
    </>
  );
}

// ── 帖子卡片（Suno song card 风格：封面 + 浮层 + hover 播放）───
function PostCard({ post, currentMember, onLike, onTriggerAgentComment, onInvite, onError, comments, onFetchComments, onCreateComment, onFollow, onUnfollow, memberCache, onFetchMember }) {
  const [liking, setLiking] = useState(false);
  const [agentPending, setAgentPending] = useState(false);
  const [invitePending, setInvitePending] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commenting, setCommenting] = useState(false);
  const [followPending, setFollowPending] = useState(false);

  const isSelf = !currentMember || post.userId === currentMember.userId;
  const cachedMember = memberCache?.[post.userId];
  const isFollowing = cachedMember?.isFollowing;

  // 懒加载作者资料（含 isFollowing），用于关注按钮状态
  useEffect(() => {
    if (!onFetchMember || isSelf || cachedMember) return;
    onFetchMember(post.userId).catch(() => { /* 非致命 */ });
  }, [post.userId, isSelf, cachedMember, onFetchMember]);

  const handleToggleComments = useCallback(async () => {
    if (!showComments && !comments && onFetchComments) {
      try { await onFetchComments(post.id); } catch (e) { onError(e.message); }
    }
    setShowComments(s => !s);
  }, [showComments, comments, post.id, onFetchComments, onError]);

  const handleCreateComment = useCallback(async (e) => {
    e.preventDefault();
    if (!commentText.trim() || !onCreateComment) return;
    setCommenting(true);
    try {
      await onCreateComment(post.id, commentText.trim());
      setCommentText('');
    } catch (err) {
      onError(err.message);
    } finally {
      setCommenting(false);
    }
  }, [post.id, commentText, onCreateComment, onError]);

  const handleFollowToggle = useCallback(async () => {
    if (!currentMember) { onError('join_community_first'); return; }
    setFollowPending(true);
    try {
      if (isFollowing) await onUnfollow(post.userId);
      else await onFollow(post.userId);
    } catch (err) {
      onError(err.message);
    } finally {
      setFollowPending(false);
    }
  }, [currentMember, isFollowing, post.userId, onFollow, onUnfollow, onError]);

  const handleLike = useCallback(async () => {
    setLiking(true);
    try {
      await onLike(post.id);
    } catch (err) {
      onError(err.message);
    } finally {
      setLiking(false);
    }
  }, [post.id, onLike, onError]);

  const handleAgentComment = useCallback(async () => {
    if (!currentMember) { onError('join_community_first'); return; }
    setAgentPending(true);
    try {
      await onTriggerAgentComment(post.id, currentMember.userId);
    } catch (err) {
      onError(err.message);
    } finally {
      setAgentPending(false);
    }
  }, [post.id, currentMember, onTriggerAgentComment, onError]);

  const handleInvite = useCallback(async () => {
    if (!currentMember) { onError('join_community_first'); return; }
    const targetUserId = post.userId;
    if (targetUserId === currentMember.userId) { onError('cannot_invite_self'); return; }
    setInvitePending(true);
    try {
      await onInvite({ fromUserId: currentMember.userId, toUserId: targetUserId });
    } catch (err) {
      onError(err.message);
    } finally {
      setInvitePending(false);
    }
  }, [post, currentMember, onInvite, onError]);

  const tags = useMemo(() => {
    if (!post.auto_tags) return [];
    const raw = typeof post.auto_tags === 'string' ? post.auto_tags.split(',') : post.auto_tags;
    return raw.map(t => String(t).trim()).filter(Boolean).slice(0, 3);
  }, [post.auto_tags]);

  // 封面占位文字：取内容前 30 字符或帖子类型
  const coverText = post.song_title
    ? `♪ ${post.song_title}`
    : (post.content || '').slice(0, 40) || post.type;

  const commentCount = comments?.length ?? post.comments_count ?? 0;

  return (
    <article className="community-card">
      {/* 封面区 */}
      <div className="community-card-cover">
        <div className="community-card-cover-text">{coverText}</div>

        {/* 右上角点赞数徽章（Suno 播放量浮层）*/}
        <div className="community-card-badge" title="likes">
          <span className="community-card-badge-icon">{post.liked ? '♥' : '♡'}</span>
          <span>{post.likes || 0}</span>
        </div>

        {/* hover 遮罩 + 点赞按钮（toggle，已赞高亮）*/}
        <div className="community-card-overlay">
          <button
            type="button"
            className={`community-card-play${post.liked ? ' liked' : ''}`}
            onClick={handleLike}
            disabled={liking}
            title={post.liked ? 'Unlike' : 'Like'}
            aria-label="like post"
          >{liking ? '···' : (post.liked ? '♥' : '♡')}</button>
        </div>
      </div>

      {/* 正文 */}
      <div className="community-card-body">
        <div className="community-card-title">{post.content}</div>
        <div className="community-card-author">
          <span className="community-card-author-avatar">
            {(post.nickname || post.userId || '?').charAt(0).toUpperCase()}
          </span>
          <span>@{post.nickname || post.userId}</span>
          {post.is_agent && (
            <span className="community-card-agent-tag" title={`agent of @${post.agent_author_user_id}`}>AGENT</span>
          )}
          {/* 关注按钮：非自己且已登录时展示，状态来自 memberCache.isFollowing */}
          {currentMember && !isSelf && (
            <button
              type="button"
              className={`community-btn community-follow-btn${isFollowing ? ' following' : ''}`}
              onClick={handleFollowToggle}
              disabled={followPending}
              title={isFollowing ? 'Unfollow' : 'Follow'}
              style={{ marginLeft: 'auto', padding: '2px 6px', fontSize: 7 }}
            >{followPending ? '...' : (isFollowing ? '✓ FOLLOWING' : '+ FOLLOW')}</button>
          )}
        </div>
        {tags.length > 0 && (
          <div className="community-card-tags">
            {tags.map(t => <span key={t} className="community-card-tag">#{t}</span>)}
          </div>
        )}
        {/* 操作行：评论 toggle + agent comment + invite */}
        <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`community-btn${showComments ? ' community-btn-primary' : ''}`}
            onClick={handleToggleComments}
            title="Comments"
            style={{ padding: '4px 8px', fontSize: 7 }}
          >◈ {commentCount}{showComments ? ' HIDE' : ' COMMENTS'}</button>
          {currentMember && (
            <>
              <button
                type="button"
                className="community-btn"
                onClick={handleAgentComment}
                disabled={agentPending}
                title="Let my agent comment (F8)"
                style={{ padding: '4px 8px', fontSize: 7 }}
              >{agentPending ? 'AGENT...' : 'AGENT COMMENT'}</button>
              <button
                type="button"
                className="community-btn"
                onClick={handleInvite}
                disabled={invitePending || post.userId === currentMember.userId}
                title="Invite TA's agent into my feed (F9)"
                style={{ padding: '4px 8px', fontSize: 7 }}
              >{invitePending ? 'INV...' : 'INVITE AGENT'}</button>
            </>
          )}
        </div>
        {/* 评论线程：展开时渲染列表 + 输入框 */}
        {showComments && (
          <CommentThread
            comments={comments || []}
            commentText={commentText}
            commenting={commenting}
            canComment={!!currentMember}
            onCommentTextChange={setCommentText}
            onSubmitComment={handleCreateComment}
          />
        )}
      </div>
    </article>
  );
}

// ── 评论线程（评论列表 + 输入框）────────────────────────────
function CommentThread({ comments, commentText, commenting, canComment, onCommentTextChange, onSubmitComment }) {
  return (
    <div className="community-comment-thread">
      {comments.length === 0 ? (
        <div className="community-comment-empty">No comments yet</div>
      ) : (
        comments.map(c => (
          <div key={c.id} className="community-comment-item">
            <span className="community-comment-avatar">
              {(c.nickname || c.userId || '?').charAt(0).toUpperCase()}
            </span>
            <div className="community-comment-body">
              <div className="community-comment-author">
                @{c.nickname || c.userId}
                {c.is_agent && <span className="community-card-agent-tag" style={{ marginLeft: 4 }}>AGENT</span>}
              </div>
              <div className="community-comment-text">{c.content}</div>
            </div>
          </div>
        ))
      )}
      {canComment ? (
        <form className="community-comment-form" onSubmit={onSubmitComment}>
          <input
            className="community-composer-input"
            type="text"
            placeholder="Write a comment..."
            value={commentText}
            onChange={e => onCommentTextChange(e.target.value)}
            aria-label="comment"
            maxLength={2000}
          />
          <button
            type="submit"
            className="community-btn community-btn-primary"
            disabled={commenting || !commentText.trim()}
          >{commenting ? '...' : 'SEND'}</button>
        </form>
      ) : (
        <div className="community-comment-empty">Join community to comment.</div>
      )}
    </div>
  );
}

// ── 发帖 Tab（Suno create panel 风格）─────────────────────
function ComposeTab({ currentMember, onCreate, onError }) {
  const [content, setContent] = useState('');
  const [type, setType] = useState('reflection');
  const [songId, setSongId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!currentMember) {
    return (
      <div className="community-empty">
        <div className="community-empty-icon">✎</div>
        <div>Join community to post.</div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      await onCreate({
        userId: currentMember.userId,
        type,
        content: content.trim(),
        songId: songId.trim() || null,
      });
      setContent('');
      setSongId('');
    } catch (err) {
      onError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="community-composer" onSubmit={handleSubmit}>
      <div className="community-composer-label">NEW POST</div>
      <textarea
        placeholder="Share a thought, a song, or a moment..."
        value={content}
        onChange={e => setContent(e.target.value)}
        maxLength={2000}
        required
      />
      <div className="community-composer-row">
        <select
          className="community-composer-select"
          value={type}
          onChange={e => setType(e.target.value)}
          aria-label="post type"
        >
          {POST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <input
          className="community-composer-input"
          type="text"
          placeholder="song id (optional)"
          value={songId}
          onChange={e => setSongId(e.target.value)}
          aria-label="song id"
        />
        <button
          type="submit"
          className="community-btn community-btn-primary"
          disabled={submitting || !content.trim()}
        >{submitting ? 'POSTING...' : 'POST'}</button>
      </div>
    </form>
  );
}

// ── 收件箱 Tab — 列表行（Suno track list 风格）────────────
function InboxTab({ inbox, currentMember }) {
  if (!currentMember) {
    return (
      <div className="community-empty">
        <div className="community-empty-icon">✉</div>
        <div>Join community to view inbox.</div>
      </div>
    );
  }
  if (!inbox || inbox.length === 0) {
    return (
      <div className="community-empty">
        <div className="community-empty-icon">✉</div>
        <div>Inbox empty</div>
      </div>
    );
  }
  return (
    <div className="community-list">
      {inbox.map(item => (
        <div key={item.id} className="community-list-item">
          <div className="community-list-thumb">✉</div>
          <div className="community-list-body">
            <div className="community-list-title">{item.title || 'Untitled'}</div>
            {item.summary && <div className="community-list-summary">{item.summary}</div>}
          </div>
          <div className="community-list-meta">
            {item.kind || 'push'}{item.from_cluster ? ` · ${item.from_cluster}` : ''}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── 簇列表 Tab — 卡片网格（Suno playlist card 风格）────────
function ClustersTab({ clusters, currentMember }) {
  if (!clusters || clusters.length === 0) {
    return (
      <div className="community-empty">
        <div className="community-empty-icon">◉</div>
        <div>No clusters yet</div>
      </div>
    );
  }
  return (
    <div className="community-grid">
      {clusters.map(c => {
        const isCurrent = currentMember && c.id === currentMember.clusterId;
        const members = c.members || [];
        const topMembers = members.slice(0, 4);
        return (
          <div key={c.id} className={`community-cluster-card${isCurrent ? ' current' : ''}`}>
            {/* 封面：2x2 网格展示前 4 个成员首字母 + 簇标签 */}
            <div className="community-cluster-cover">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="community-cluster-cover-cell">
                  {topMembers[i] ? (topMembers[i].nickname || topMembers[i].userId || '?').charAt(0).toUpperCase() : '·'}
                </div>
              ))}
              <div className="community-cluster-cover-label">
                {c.label || `cluster-${c.id}`}
              </div>
            </div>
            <div className="community-cluster-body">
              <div className="community-card-author">
                <span className="community-card-author-avatar">{members.length}</span>
                <span>members</span>
                {isCurrent && <span className="community-card-agent-tag">YOU</span>}
              </div>
              <div className="community-cluster-members">
                {members.slice(0, 8).map(m => `@${m.nickname || m.userId}`).join('  ')}
                {members.length > 8 ? ` +${members.length - 8}` : ''}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── 通知 Tab — 列表行（Suno activity list 风格）───────────
function NotificationsTab({ notifications, onClear }) {
  if (!notifications || notifications.length === 0) {
    return (
      <div className="community-empty">
        <div className="community-empty-icon">◈</div>
        <div>No notifications</div>
      </div>
    );
  }
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button type="button" className="community-btn" onClick={onClear}>CLEAR ALL</button>
      </div>
      <div className="community-list">
        {notifications.map((n, idx) => (
          <div key={`${n.at}-${idx}`} className="community-notification-item">
            <div className="community-notification-icon">
              {NOTIFICATION_ICONS[n.type] || '●'}
            </div>
            <div className="community-notification-body">
              <div className="community-notification-type">{n.type}</div>
              <div className="community-notification-text">
                {n.postId && <span>post #{n.postId} </span>}
                {n.payload && (n.payload.title || n.payload.summary || JSON.stringify(n.payload).slice(0, 80))}
              </div>
            </div>
            <div className="community-notification-time">
              {new Date(n.at).toLocaleTimeString()}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ── Agent 配置 Tab（Suno settings card 风格）──────────────
function AgentTab({ currentMember, agentConfig, onUpdate, onError }) {
  const [rules, setRules] = useState({
    canComment: true,
    allowedTopics: [],
    canBeInvited: true,
    sharePlaylists: false,
  });
  const [topicInput, setTopicInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (agentConfig) {
      setRules({
        canComment: agentConfig.canComment ?? true,
        allowedTopics: agentConfig.allowedTopics || [],
        canBeInvited: agentConfig.canBeInvited ?? true,
        sharePlaylists: agentConfig.sharePlaylists ?? false,
      });
    }
  }, [agentConfig]);

  if (!currentMember) {
    return (
      <div className="community-empty">
        <div className="community-empty-icon">◈</div>
        <div>Join community to configure agent.</div>
      </div>
    );
  }

  const handleAddTopic = () => {
    const t = topicInput.trim();
    if (!t || rules.allowedTopics.includes(t)) return;
    setRules(prev => ({ ...prev, allowedTopics: [...prev.allowedTopics, t] }));
    setTopicInput('');
  };

  const handleRemoveTopic = (t) => {
    setRules(prev => ({ ...prev, allowedTopics: prev.allowedTopics.filter(x => x !== t) }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate(currentMember.userId, rules);
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="community-agent-section">
        <Toggle
          label="Can comment"
          hint="Allow my agent to post comments on my behalf (F8)"
          on={rules.canComment}
          onToggle={() => setRules(prev => ({ ...prev, canComment: !prev.canComment }))}
        />
        <Toggle
          label="Can be invited"
          hint="Other members can invite my agent (F9)"
          on={rules.canBeInvited}
          onToggle={() => setRules(prev => ({ ...prev, canBeInvited: !prev.canBeInvited }))}
        />
        <Toggle
          label="Share playlists"
          hint="My agent carries my playlists when invited"
          on={rules.sharePlaylists}
          onToggle={() => setRules(prev => ({ ...prev, sharePlaylists: !prev.sharePlaylists }))}
        />
      </div>

      <div className="community-agent-section">
        <div className="community-agent-rule" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 8 }}>
          <div className="community-agent-rule-info" style={{ width: '100%' }}>
            <div className="community-agent-rule-label">Allowed topics</div>
            <div className="community-agent-rule-hint">Topics my agent can comment on (empty = unrestricted)</div>
          </div>
          <div className="community-composer-row" style={{ width: '100%' }}>
            <input
              className="community-composer-input"
              type="text"
              placeholder="topic"
              value={topicInput}
              onChange={e => setTopicInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTopic(); } }}
              aria-label="new topic"
            />
            <button type="button" className="community-btn" onClick={handleAddTopic}>ADD</button>
          </div>
          {rules.allowedTopics.length > 0 && (
            <div className="community-card-tags" style={{ width: '100%' }}>
              {rules.allowedTopics.map(t => (
                <button
                  type="button"
                  key={t}
                  className="community-card-tag"
                  onClick={() => handleRemoveTopic(t)}
                  style={{ cursor: 'pointer', background: 'transparent' }}
                  title="remove"
                >#{t} ✕</button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="community-btn community-btn-primary"
          onClick={handleSave}
          disabled={saving}
        >{saving ? 'SAVING...' : 'SAVE RULES'}</button>
      </div>
    </>
  );
}

// ── Toggle 开关（Suno switch 风格）────────────────────────
function Toggle({ label, hint, on, onToggle }) {
  return (
    <div className="community-agent-rule">
      <div className="community-agent-rule-info">
        <div className="community-agent-rule-label">{label}</div>
        <div className="community-agent-rule-hint">{hint}</div>
      </div>
      <button
        type="button"
        className={`community-toggle${on ? ' on' : ''}`}
        onClick={onToggle}
        role="switch"
        aria-checked={on}
        aria-label={label}
      />
    </div>
  );
}

// ── 房间 Tab — 卡片网格 + 创建表单 + 房间内视图（F5）─────
function RoomsTab({ rooms, roomState, currentMember, onCreate, onJoin, onEnd, onSkip, onError }) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [topicTags, setTopicTags] = useState('');
  const [creating, setCreating] = useState(false);

  if (!currentMember) {
    return (
      <div className="community-empty">
        <div className="community-empty-icon">◉</div>
        <div>Join community to use rooms.</div>
      </div>
    );
  }

  // 如果有房间状态，显示房间内视图
  if (roomState) {
    return <RoomInterior roomState={roomState} currentMember={currentMember} onEnd={onEnd} onSkip={onSkip} />;
  }

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const tags = topicTags.trim()
        ? topicTags.split(',').map(t => t.trim()).filter(Boolean)
        : [];
      await onCreate({ hostUserId: currentMember.userId, name: name.trim(), topicTags: tags });
      setName('');
      setTopicTags('');
      setShowCreate(false);
    } catch (err) {
      onError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="community-composer-label">ACTIVE ROOMS</div>
        <button
          type="button"
          className="community-btn community-btn-primary"
          onClick={() => setShowCreate(s => !s)}
        >{showCreate ? 'CANCEL' : '+ CREATE ROOM'}</button>
      </div>

      {showCreate && (
        <form className="community-composer" onSubmit={handleCreate}>
          <div className="community-composer-row">
            <input
              className="community-composer-input"
              type="text"
              placeholder="room name"
              value={name}
              onChange={e => setName(e.target.value)}
              aria-label="room name"
              required
            />
            <input
              className="community-composer-input"
              type="text"
              placeholder="topic tags (comma-separated)"
              value={topicTags}
              onChange={e => setTopicTags(e.target.value)}
              aria-label="topic tags"
            />
            <button
              type="submit"
              className="community-btn community-btn-primary"
              disabled={creating || !name.trim()}
            >{creating ? 'CREATING...' : 'CREATE'}</button>
          </div>
        </form>
      )}

      {(!rooms || rooms.length === 0) ? (
        <div className="community-empty">
          <div className="community-empty-icon">◉</div>
          <div>No active rooms</div>
        </div>
      ) : (
        <div className="community-grid">
          {rooms.map(room => (
            <div key={room.roomId} className="community-card">
              <div className="community-card-cover">
                <div className="community-card-cover-text">{room.name || 'Untitled Room'}</div>
                <div className="community-card-badge">
                  <span className="community-card-badge-icon">◉</span>
                  <span>{room.status === 'active' ? 'LIVE' : 'END'}</span>
                </div>
              </div>
              <div className="community-card-body">
                <div className="community-card-title">{room.name}</div>
                <div className="community-card-author">
                  <span className="community-card-author-avatar">H</span>
                  <span>@{room.hostUserId}</span>
                </div>
                {room.topicTags && room.topicTags.length > 0 && (
                  <div className="community-card-tags">
                    {room.topicTags.map(t => <span key={t} className="community-card-tag">#{t}</span>)}
                  </div>
                )}
                {room.hostUserId !== currentMember.userId && (
                  <button
                    type="button"
                    className="community-btn community-btn-primary"
                    style={{ marginTop: 4, padding: '4px 8px', fontSize: 7 }}
                    onClick={() => onJoin(room.roomId, currentMember.userId).catch(e => onError(e.message))}
                  >JOIN</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── 房间内视图（播放同步 + 房主控制）──────────────────────
function RoomInterior({ roomState, currentMember, onEnd, onSkip }) {
  const isHost = roomState.hostUserId === currentMember.userId;

  return (
    <>
      <div className="community-hero">
        <div className="community-hero-cover">{roomState.isPlaying ? '▶' : '❚❚'}</div>
        <div className="community-hero-meta">
          <div className="community-hero-label">LISTENING ROOM</div>
          <div className="community-hero-title">{roomState.name || roomState.roomId}</div>
          <div className="community-hero-stats">
            <span className="community-hero-stat">
              host <span className="community-hero-stat-value">@{roomState.hostUserId}</span>
            </span>
            <span className="community-hero-stat">
              status <span className="community-hero-stat-value">{roomState.isPlaying ? 'playing' : 'paused'}</span>
            </span>
            {roomState.currentSong && (
              <span className="community-hero-stat">
                ♪ <span className="community-hero-stat-value">{roomState.currentSong}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {isHost && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="community-btn"
            onClick={() => onSkip(roomState.roomId)}
          >SKIP</button>
          <button
            type="button"
            className="community-btn"
            onClick={() => onEnd(roomState.roomId, currentMember.userId)}
          >END ROOM</button>
        </div>
      )}

      {roomState.playlists && roomState.playlists.length > 0 && (
        <div className="community-list">
          {roomState.playlists.map((pl, i) => (
            <div key={pl.id || i} className="community-list-item">
              <div className="community-list-thumb">♪</div>
              <div className="community-list-body">
                <div className="community-list-title">{pl.name || `Playlist ${i + 1}`}</div>
                <div className="community-list-summary">{pl.trackCount || 0} tracks</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── 邀请 Tab — 发起 + 列表 + 响应（F9）──────────────────
function InvitationsTab({ invitations, currentMember, onRespond, onBringPlaylist, onInvite, onError }) {
  const [inviteToUserId, setInviteToUserId] = useState('');
  const [inviting, setInviting] = useState(false);

  if (!currentMember) {
    return (
      <div className="community-empty">
        <div className="community-empty-icon">✉</div>
        <div>Join community to use invitations.</div>
      </div>
    );
  }

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteToUserId.trim()) return;
    setInviting(true);
    try {
      await onInvite({ fromUserId: currentMember.userId, toUserId: inviteToUserId.trim() });
      setInviteToUserId('');
    } catch (err) {
      onError(err.message);
    } finally {
      setInviting(false);
    }
  };

  const sent = invitations.filter(inv => inv.fromUserId === currentMember.userId);
  const received = invitations.filter(inv => inv.toUserId === currentMember.userId);

  return (
    <>
      <form className="community-composer" onSubmit={handleInvite}>
        <div className="community-composer-label">INVITE AN AGENT</div>
        <div className="community-composer-row">
          <input
            className="community-composer-input"
            type="text"
            placeholder="target user id"
            value={inviteToUserId}
            onChange={e => setInviteToUserId(e.target.value)}
            aria-label="target user id"
            required
          />
          <button
            type="submit"
            className="community-btn community-btn-primary"
            disabled={inviting || !inviteToUserId.trim()}
          >{inviting ? 'INVITING...' : 'INVITE'}</button>
        </div>
      </form>

      {received.length > 0 && (
        <>
          <div className="community-composer-label">RECEIVED</div>
          <div className="community-list">
            {received.map(inv => (
              <div key={inv.id} className="community-list-item">
                <div className="community-list-thumb">✉</div>
                <div className="community-list-body">
                  <div className="community-list-title">@{inv.fromUserId}</div>
                  <div className="community-list-summary">
                    {inv.contextType} · {inv.status}
                  </div>
                </div>
                {inv.status === 'pending' && (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      type="button"
                      className="community-btn community-btn-primary"
                      style={{ padding: '4px 8px', fontSize: 7 }}
                      onClick={() => onRespond(inv.id, 'accepted').catch(e => onError(e.message))}
                    >ACCEPT</button>
                    <button
                      type="button"
                      className="community-btn"
                      style={{ padding: '4px 8px', fontSize: 7 }}
                      onClick={() => onRespond(inv.id, 'rejected').catch(e => onError(e.message))}
                    >REJECT</button>
                  </div>
                )}
                {inv.status === 'active' && (
                  <button
                    type="button"
                    className="community-btn"
                    style={{ padding: '4px 8px', fontSize: 7 }}
                    onClick={() => onBringPlaylist(inv.id).catch(e => onError(e.message))}
                  >BRING PLAYLIST</button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {sent.length > 0 && (
        <>
          <div className="community-composer-label">SENT</div>
          <div className="community-list">
            {sent.map(inv => (
              <div key={inv.id} className="community-list-item">
                <div className="community-list-thumb">↗</div>
                <div className="community-list-body">
                  <div className="community-list-title">@{inv.toUserId}</div>
                  <div className="community-list-summary">
                    {inv.contextType} · {inv.status}
                  </div>
                </div>
                <div className="community-list-meta">{inv.status}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {received.length === 0 && sent.length === 0 && (
        <div className="community-empty">
          <div className="community-empty-icon">✉</div>
          <div>No invitations yet</div>
        </div>
      )}
    </>
  );
}
