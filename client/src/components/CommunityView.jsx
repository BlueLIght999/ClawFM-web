import { useEffect, useState, useCallback, useMemo } from 'react';
import { useCommunity } from '../contexts/CommunityContext.jsx';
import './community.css';

/**
 * CommunityView — 社区模块入口视图（PRD v0.3 F1-F9）。
 *
 * 视觉：像素风（Press Start 2P + VT323 + 青橙配色 + CRT 扫描线）
 *      + Suno playlist 布局（卡片网格 / 封面 hero / 播放量浮层 / hover 抬升 / 列表行）
 *
 * Tab：feed / compose / inbox / clusters / notifications / agent
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

const NOTIFICATION_ICONS = {
  push: '◉',
  'agent-comment': '◈',
  invitation: '✉',
};

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
        <JoinHero onCreate={createMember} onError={setError} />
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

// ── 加入社区 Hero（Suno CTA 风格）─────────────────────────
function JoinHero({ onCreate, onError }) {
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
            placeholder="user id"
            value={userId}
            onChange={e => setUserId(e.target.value)}
            aria-label="user id"
            required
          />
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
            disabled={submitting}
          >{submitting ? 'JOINING...' : 'JOIN'}</button>
        </div>
      </div>
    </form>
  );
}

// ── Feed Tab — 卡片网格（Suno trending grid 风格）─────────
function FeedTab({ feed, currentMember, hasMore, loadingMore, onLoadMore, onLike, onTriggerAgentComment, onError }) {
  if (!feed || feed.length === 0) {
    return (
      <div className="community-empty">
        <div className="community-empty-icon">♪</div>
        <div>No posts yet</div>
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
            onError={onError}
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

  // 封面占位文字：取内容前 30 字符或帖子类型
  const coverText = post.song_title
    ? `♪ ${post.song_title}`
    : (post.content || '').slice(0, 40) || post.type;

  return (
    <article className="community-card">
      {/* 封面区 */}
      <div className="community-card-cover">
        <div className="community-card-cover-text">{coverText}</div>

        {/* 右上角点赞数徽章（Suno 播放量浮层）*/}
        <div className="community-card-badge" title="likes">
          <span className="community-card-badge-icon">♥</span>
          <span>{post.likes || 0}</span>
        </div>

        {/* hover 遮罩 + 播放/点赞按钮 */}
        <div className="community-card-overlay">
          <button
            type="button"
            className="community-card-play"
            onClick={handleLike}
            disabled={liking}
            title="Like"
            aria-label="like post"
          >{liking ? '···' : '♥'}</button>
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
        </div>
        {tags.length > 0 && (
          <div className="community-card-tags">
            {tags.map(t => <span key={t} className="community-card-tag">#{t}</span>)}
          </div>
        )}
        {currentMember && (
          <button
            type="button"
            className="community-btn"
            onClick={handleAgentComment}
            disabled={agentPending}
            title="Let my agent comment (F8)"
            style={{ marginTop: 4, padding: '4px 8px', fontSize: 7 }}
          >{agentPending ? 'AGENT...' : 'AGENT COMMENT'}</button>
        )}
      </div>
    </article>
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
