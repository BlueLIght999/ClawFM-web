import { useEffect, useState, useCallback, useMemo } from 'react';
import { useCommunity } from '../contexts/CommunityContext.jsx';
import './community.css';

/**
 * CommunityView — 社区模块入口视图（PRD v0.3 F1-F9）。
 *
 * 自包含：从 CommunityContext 取状态/方法，不接收外部 props。
 * Tab：feed（动态）/ compose（发帖）/ inbox（收件箱）/ clusters（簇列表）/
 *      notifications（通知）/ agent（Agent 配置）
 *
 * - 公共读取（feed/clusters）在 mount 时拉取，不需要 currentMember
 * - 写操作（发帖/点赞/触发 agent 评论/更新 agent 配置）需要 currentMember；
 *   未加入社区时，在操作处内联显示"加入社区"表单
 */
const TABS = [
  { id: 'feed', label: 'FEED' },
  { id: 'compose', label: 'POST' },
  { id: 'inbox', label: 'INBOX' },
  { id: 'clusters', label: 'CLUSTERS' },
  { id: 'notifications', label: 'NOTIFY' },
  { id: 'agent', label: 'AGENT' },
];

const POST_TYPES = [
  { value: 'reflection', label: 'Reflection' },
  { value: 'history', label: 'History' },
  { value: 'recommend', label: 'Recommend' },
];

export default function CommunityView() {
  const community = useCommunity();
  const {
    currentMember, feed, inbox, clusters, notifications, agentConfig,
    fetchFeed, fetchInbox, fetchClusters,
    createPost, likePost, triggerAgentComment, updateAgentConfig,
    createMember, clearNotifications,
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
        // 非致命，不打断首屏
      }
    })();
    return () => { cancelled = true; };
  }, [fetchFeed, fetchClusters]);

  // 切到 inbox 时拉收件箱
  useEffect(() => {
    if (activeTab !== 'inbox' || !currentMember) return;
    fetchInbox(currentMember.userId).catch(e => setError(e.message));
  }, [activeTab, currentMember, fetchInbox]);

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

  return (
    <div className="community-view">
      <h2 className="pixel-title" style={{ fontSize: 12 }}>COMMUNITY</h2>

      {error && (
        <div className="community-error" role="alert">
          {error}
          <button className="pixel-btn" style={{ marginLeft: 8, fontSize: 7 }}
            onClick={() => setError(null)}>DISMISS</button>
        </div>
      )}

      {!currentMember && <JoinPanel onCreate={createMember} onError={setError} />}

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
          onError={setError}
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

      {activeTab === 'clusters' && (
        <ClustersTab clusters={clusters} currentMember={currentMember} />
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

// ── 加入社区表单（F1，未加入时显示）────────────────────────
function JoinPanel({ onCreate, onError }) {
  const [userId, setUserId] = useState('');
  const [nickname, setNickname] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleJoin = useCallback(async (e) => {
    e.preventDefault();
    if (!userId.trim() || !nickname.trim()) return;
    setSubmitting(true);
    try {
      await onCreate({ userId: userId.trim(), nickname: nickname.trim() });
    } catch (err) {
      onError(err.message || 'create_member_failed');
    } finally {
      setSubmitting(false);
    }
  }, [userId, nickname, onCreate, onError]);

  return (
    <form className="pixel-border community-panel" onSubmit={handleJoin}>
      <p className="community-panel-title">JOIN COMMUNITY</p>
      <div className="community-join-form">
        <input
          className="pixel-input"
          type="text"
          placeholder="user id"
          value={userId}
          onChange={e => setUserId(e.target.value)}
          aria-label="user id"
          required
        />
        <input
          className="pixel-input"
          type="text"
          placeholder="nickname"
          value={nickname}
          onChange={e => setNickname(e.target.value)}
          aria-label="nickname"
          required
        />
        <button
          type="submit"
          className="pixel-btn accent"
          disabled={submitting}
        >{submitting ? 'JOINING...' : 'JOIN'}</button>
      </div>
    </form>
  );
}

// ── Feed Tab（F6）──────────────────────────────────────────
function FeedTab({ feed, currentMember, hasMore, loadingMore, onLoadMore, onLike, onTriggerAgentComment, onError }) {
  if (!feed || feed.length === 0) {
    return (
      <div className="pixel-border community-panel">
        <div className="community-empty"><span className="cursor-blink">No posts yet</span></div>
      </div>
    );
  }
  return (
    <div className="pixel-border community-panel">
      <p className="community-panel-title">RECENT POSTS</p>
      {feed.map(post => (
        <PostCard
          key={post.id}
          post={post}
          currentMember={currentMember}
          onLike={onLike}
          onTriggerAgentComment={onTriggerAgentComment}
          onError={onError}
        />
      ))}
      {hasMore && (
        <button
          type="button"
          className="community-load-more"
          onClick={onLoadMore}
          disabled={loadingMore}
        >{loadingMore ? 'LOADING...' : 'LOAD MORE'}</button>
      )}
    </div>
  );
}

// ── 帖子卡片（F2 + F8 触发口）─────────────────────────────
function PostCard({ post, currentMember, onLike, onTriggerAgentComment, onError }) {
  const [liking, setLiking] = useState(false);
  const [agentPending, setAgentPending] = useState(false);

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

  const tags = useMemo(() => {
    if (!post.auto_tags) return [];
    const raw = typeof post.auto_tags === 'string' ? post.auto_tags.split(',') : post.auto_tags;
    return raw.map(t => String(t).trim()).filter(Boolean).slice(0, 3);
  }, [post.auto_tags]);

  return (
    <article className="community-post">
      <div className="community-post-header">
        <span>
          <span className="community-post-author">@{post.nickname || post.userId}</span>
          {post.is_agent && <span className="community-post-agent-tag" title={`agent of @${post.agent_author_user_id}`}>AGENT</span>}
        </span>
        <span className="community-post-type">{post.type}</span>
      </div>

      <div className="community-post-content">{post.content}</div>

      {(post.song_title || post.playlist_id) && (
        <div className="community-post-song">
          {post.song_title ? `♪ ${post.song_title}${post.song_artist ? ' — ' + post.song_artist : ''}` : `♫ playlist:${post.playlist_id}`}
        </div>
      )}

      {tags.length > 0 && (
        <div className="community-post-tags">
          {tags.map(t => <span key={t} className="community-post-tag">#{t}</span>)}
        </div>
      )}

      <div className="community-post-actions">
        <button
          type="button"
          className="pixel-btn"
          onClick={handleLike}
          disabled={liking}
          aria-label="like post"
        >{liking ? '...' : 'LIKE'}</button>
        <span className="community-post-like-count">{post.likes || 0}</span>
        {currentMember && (
          <button
            type="button"
            className="pixel-btn"
            onClick={handleAgentComment}
            disabled={agentPending}
            title="Let my agent comment (F8)"
          >{agentPending ? 'AGENT...' : 'AGENT COMMENT'}</button>
        )}
      </div>
    </article>
  );
}

// ── 发帖 Tab（F2）──────────────────────────────────────────
function ComposeTab({ currentMember, onCreate, onError }) {
  const [content, setContent] = useState('');
  const [type, setType] = useState('reflection');
  const [songId, setSongId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!currentMember) {
    return (
      <div className="pixel-border community-panel">
        <div className="community-empty">Join community to post.</div>
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
    <form className="pixel-border community-panel community-composer" onSubmit={handleSubmit}>
      <p className="community-panel-title">NEW POST</p>
      <textarea
        className="pixel-input"
        placeholder="Share a thought, a song, or a moment..."
        value={content}
        onChange={e => setContent(e.target.value)}
        maxLength={2000}
        required
      />
      <div className="community-composer-row">
        <select
          className="pixel-input"
          value={type}
          onChange={e => setType(e.target.value)}
          aria-label="post type"
        >
          {POST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <input
          className="pixel-input"
          type="text"
          placeholder="song id (optional)"
          value={songId}
          onChange={e => setSongId(e.target.value)}
          aria-label="song id"
        />
        <button
          type="submit"
          className="pixel-btn accent"
          disabled={submitting || !content.trim()}
        >{submitting ? 'POSTING...' : 'POST'}</button>
      </div>
    </form>
  );
}

// ── 收件箱 Tab（F4）────────────────────────────────────────
function InboxTab({ inbox, currentMember }) {
  if (!currentMember) {
    return (
      <div className="pixel-border community-panel">
        <div className="community-empty">Join community to view inbox.</div>
      </div>
    );
  }
  if (!inbox || inbox.length === 0) {
    return (
      <div className="pixel-border community-panel">
        <div className="community-empty"><span className="cursor-blink">Inbox empty</span></div>
      </div>
    );
  }
  return (
    <div className="pixel-border community-panel">
      <p className="community-panel-title">INBOX</p>
      {inbox.map(item => (
        <div key={item.id} className="community-inbox-item">
          <div className="community-inbox-meta">
            {item.kind || 'push'}{item.from_cluster ? ` · ${item.from_cluster}` : ''}
          </div>
          <div className="community-inbox-title">{item.title || 'Untitled'}</div>
          {item.summary && <div className="community-inbox-summary">{item.summary}</div>}
        </div>
      ))}
    </div>
  );
}

// ── 簇列表 Tab（F3）────────────────────────────────────────
function ClustersTab({ clusters, currentMember }) {
  if (!clusters || clusters.length === 0) {
    return (
      <div className="pixel-border community-panel">
        <div className="community-empty"><span className="cursor-blink">No clusters yet</span></div>
      </div>
    );
  }
  return (
    <div className="pixel-border community-panel">
      <p className="community-panel-title">CLUSTERS</p>
      {clusters.map(c => {
        const isCurrent = currentMember && c.id === currentMember.clusterId;
        return (
          <div key={c.id} className={`community-cluster${isCurrent ? ' current' : ''}`}>
            <div className="community-cluster-header">
              <span className="community-cluster-label">{c.label || `cluster-${c.id}`}</span>
              <span className="community-cluster-count">{(c.members || []).length} members</span>
            </div>
            <div className="community-cluster-members">
              {(c.members || []).slice(0, 12).map(m => `@${m.nickname || m.userId}`).join('  ')}
              {(c.members || []).length > 12 ? ' ...' : ''}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── 通知 Tab（F4 push / F8 agent-comment / F9 invitation）──
function NotificationsTab({ notifications, onClear }) {
  if (!notifications || notifications.length === 0) {
    return (
      <div className="pixel-border community-panel">
        <div className="community-empty"><span className="cursor-blink">No notifications</span></div>
      </div>
    );
  }
  return (
    <div className="pixel-border community-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <p className="community-panel-title" style={{ margin: 0 }}>NOTIFICATIONS</p>
        <button type="button" className="pixel-btn" onClick={onClear}>CLEAR</button>
      </div>
      {notifications.map((n, idx) => (
        <div key={`${n.at}-${idx}`} className="community-notification">
          <span className="community-notification-type">{n.type}</span>
          {n.postId && <span>post #{n.postId} </span>}
          {n.payload && (n.payload.title || n.payload.summary || JSON.stringify(n.payload).slice(0, 80))}
          <span className="community-notification-time"> · {new Date(n.at).toLocaleTimeString()}</span>
        </div>
      ))}
    </div>
  );
}

// ── Agent 配置 Tab（F7）───────────────────────────────────
function AgentTab({ currentMember, agentConfig, onUpdate, onError }) {
  const [rules, setRules] = useState({
    canComment: true,
    allowedTopics: [],
    canBeInvited: true,
    sharePlaylists: false,
  });
  const [topicInput, setTopicInput] = useState('');
  const [saving, setSaving] = useState(false);

  // 同步 prop agentConfig 到本地 state
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
      <div className="pixel-border community-panel">
        <div className="community-empty">Join community to configure agent.</div>
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
    <div className="pixel-border community-panel">
      <p className="community-panel-title">AGENT RULES</p>

      <div className="community-agent-rule">
        <div>
          <div className="community-agent-rule-label">Can comment</div>
          <div className="community-agent-rule-hint">Allow my agent to post comments on my behalf (F8)</div>
        </div>
        <button
          type="button"
          className={`pixel-btn ${rules.canComment ? 'accent' : ''}`}
          onClick={() => setRules(prev => ({ ...prev, canComment: !prev.canComment }))}
        >{rules.canComment ? 'ON' : 'OFF'}</button>
      </div>

      <div className="community-agent-rule">
        <div>
          <div className="community-agent-rule-label">Can be invited</div>
          <div className="community-agent-rule-hint">Other members can invite my agent (F9)</div>
        </div>
        <button
          type="button"
          className={`pixel-btn ${rules.canBeInvited ? 'accent' : ''}`}
          onClick={() => setRules(prev => ({ ...prev, canBeInvited: !prev.canBeInvited }))}
        >{rules.canBeInvited ? 'ON' : 'OFF'}</button>
      </div>

      <div className="community-agent-rule">
        <div>
          <div className="community-agent-rule-label">Share playlists</div>
          <div className="community-agent-rule-hint">My agent carries my playlists when invited</div>
        </div>
        <button
          type="button"
          className={`pixel-btn ${rules.sharePlaylists ? 'accent' : ''}`}
          onClick={() => setRules(prev => ({ ...prev, sharePlaylists: !prev.sharePlaylists }))}
        >{rules.sharePlaylists ? 'ON' : 'OFF'}</button>
      </div>

      <div className="community-agent-rule" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
        <div style={{ width: '100%' }}>
          <div className="community-agent-rule-label">Allowed topics</div>
          <div className="community-agent-rule-hint">Topics my agent can comment on (empty = unrestricted)</div>
        </div>
        <div className="community-composer-row" style={{ width: '100%', marginTop: 6 }}>
          <input
            className="pixel-input"
            type="text"
            placeholder="topic"
            value={topicInput}
            onChange={e => setTopicInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTopic(); } }}
            aria-label="new topic"
          />
          <button type="button" className="pixel-btn" onClick={handleAddTopic}>ADD</button>
        </div>
        {rules.allowedTopics.length > 0 && (
          <div className="community-post-tags" style={{ marginTop: 6 }}>
            {rules.allowedTopics.map(t => (
              <button
                type="button"
                key={t}
                className="community-post-tag"
                onClick={() => handleRemoveTopic(t)}
                style={{ cursor: 'pointer', background: 'transparent' }}
                title="remove"
              >#{t} ✕</button>
            ))}
          </div>
        )}
      </div>

      <div className="community-composer-row" style={{ justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="pixel-btn accent"
          onClick={handleSave}
          disabled={saving}
        >{saving ? 'SAVING...' : 'SAVE RULES'}</button>
      </div>
    </div>
  );
}
