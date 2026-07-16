import { useState, useEffect, useCallback } from 'react';

/**
 * ProfilePanel — displays the user's music taste profile.
 *
 * Listens for Socket.IO events from the profile system:
 *   - profile:updated  → full profile snapshot (tags + analysis)
 *   - profile:tags     → incremental tag updates (merged into profile.tags)
 *   - profile:cluster  → cluster classification result
 *
 * Shows top genre tags as horizontal bars (width = weight), current mood
 * from emotion analysis, listening habit (peak period), chat style, and
 * cluster label if available. Collapsible / expandable.
 */

const MOOD_LABELS = {
  morning: '早晨',
  afternoon: '下午',
  evening: '晚上',
  night: '深夜',
};

const MOOD_EMOJI = {
  happy: '😄',
  sad: '😢',
  energetic: '⚡',
  calm: '🌙',
  nostalgic: '📼',
  romantic: '💜',
  angry: '😠',
  dreamy: '💭',
};

export default function ProfilePanel({ socket }) {
  const [profile, setProfile] = useState(null);
  const [tags, setTags] = useState(null);
  const [cluster, setCluster] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!socket) return;

    const handleProfileUpdate = (data) => {
      setProfile(data);
    };

    const handleTags = (data) => {
      // Incremental tag update: merge into existing tags state.
      // data may be { dimension: 'genre', tags: { ... } } or a full tags object.
      setTags((prev) => {
        if (!data) return prev;
        if (data.dimension && data.tags) {
          return { ...(prev || {}), [data.dimension]: data.tags };
        }
        return { ...(prev || {}), ...data };
      });
    };

    const handleCluster = (data) => {
      setCluster(data);
    };

    socket.on('profile:updated', handleProfileUpdate);
    socket.on('profile:tags', handleTags);
    socket.on('profile:cluster', handleCluster);

    return () => {
      socket.off('profile:updated', handleProfileUpdate);
      socket.off('profile:tags', handleTags);
      socket.off('profile:cluster', handleCluster);
    };
  }, [socket]);

  const handleToggle = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  if (!profile && !cluster && !tags) return null;

  // Merge profile.tags with incremental tags updates (tags state takes priority)
  const mergedTags = { ...(profile?.tags || {}), ...(tags || {}) };
  const effectiveProfile = profile ? { ...profile, tags: mergedTags } : { tags: mergedTags };

  const topGenres = getTopTags(effectiveProfile, 'genre', 5);
  const topMoods = getTopTags(effectiveProfile, 'mood', 3);
  const habit = profile?.analysis?.dailyHabit;
  const chatStyle = profile?.analysis?.chatStyle;
  const emotion = profile?.analysis?.emotion;

  return (
    <div className="pixel-border" style={containerStyle}>
      {/* Header — clickable toggle */}
      <button
        onClick={handleToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'var(--font-pixel)',
          fontSize: 10,
          letterSpacing: '1px',
          color: 'var(--text-primary)',
          background: 'transparent',
          borderBottom: expanded ? '1px solid var(--border-dim)' : 'none',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--accent)' }}>{expanded ? '[-]' : '[+]'}</span>
          <span>🎵 音乐画像</span>
        </span>
        <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>
          {topGenres.length > 0 ? `${topGenres.length} tags` : 'loading...'}
        </span>
      </button>

      {expanded && (
        <div style={bodyStyle}>
          {/* Cluster label */}
          {cluster && (
            <div style={clusterStyle}>
              <span style={clusterLabelStyle}>聚类</span>
              <span style={clusterValueStyle}>
                {cluster.clusterLabel || '未分类'}
                {cluster.memberCount != null && (
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 4 }}>
                    ({cluster.memberCount} members)
                  </span>
                )}
              </span>
            </div>
          )}

          {/* Current mood */}
          {emotion && emotion.currentMood && (
            <div style={sectionStyle}>
              <div style={sectionTitleStyle}>当前情绪</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-primary)' }}>
                <span>{MOOD_EMOJI[emotion.currentMood] || '🎵'}</span>
                <span style={{ textTransform: 'capitalize' }}>{emotion.currentMood}</span>
                {emotion.shift && emotion.shift !== 'stable' && (
                  <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                    ({emotion.shift})
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Genre preferences */}
          {topGenres.length > 0 && (
            <div style={sectionStyle}>
              <div style={sectionTitleStyle}>流派偏好</div>
              {topGenres.map((tag) => (
                <TagBar key={tag.name} name={tag.name} weight={tag.weight} color="#7c5cff" />
              ))}
            </div>
          )}

          {/* Mood tags */}
          {topMoods.length > 0 && (
            <div style={sectionStyle}>
              <div style={sectionTitleStyle}>情绪标签</div>
              {topMoods.map((tag) => (
                <TagBar key={tag.name} name={tag.name} weight={tag.weight} color="#60a5fa" />
              ))}
            </div>
          )}

          {/* Listening habit */}
          {habit && (
            <div style={sectionStyle}>
              <div style={sectionTitleStyle}>收听习惯</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                活跃时段: {MOOD_LABELS[habit.peakPeriod] || habit.peakPeriod || '未知'}
                {habit.peakHour != null && ` · ${habit.peakHour}:00`}
                {' · 一致性: '}
                {Math.round((habit.consistency || 0) * 100)}%
              </div>
            </div>
          )}

          {/* Chat style */}
          {chatStyle && chatStyle.style && chatStyle.style !== 'unknown' && (
            <div style={sectionStyle}>
              <div style={sectionTitleStyle}>交流风格</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {chatStyle.style}
                {chatStyle.confidence != null && (
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 4 }}>
                    ({Math.round(chatStyle.confidence * 100)}%)
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TagBar({ name, weight, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <span
        style={{
          width: 60,
          fontSize: 11,
          color: 'var(--text-dim)',
          textAlign: 'right',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          flexShrink: 0,
        }}
      >
        {name}
      </span>
      <div
        style={{
          flex: 1,
          height: 6,
          background: 'var(--bg-primary)',
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${Math.round(weight * 100)}%`,
            height: '100%',
            background: color,
            borderRadius: 3,
            transition: 'width 0.3s ease-out',
          }}
        />
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', width: 32, textAlign: 'right', flexShrink: 0 }}>
        {Math.round(weight * 100) / 100}
      </span>
    </div>
  );
}

function getTopTags(profile, dimension, limit) {
  if (!profile?.tags?.[dimension]) return [];
  return Object.entries(profile.tags[dimension])
    .map(([name, data]) => ({ name, weight: data?.weight || 0, evidenceCount: data?.evidenceCount || 0 }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit);
}

const containerStyle = {
  background: 'var(--bg-secondary)',
  margin: '4px 0',
  overflow: 'hidden',
};

const bodyStyle = {
  padding: '8px 12px 10px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const sectionStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};

const sectionTitleStyle = {
  fontFamily: 'var(--font-pixel)',
  fontSize: 9,
  color: 'var(--text-dim)',
  letterSpacing: '1px',
  textTransform: 'uppercase',
  marginBottom: 2,
};

const clusterStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: 12,
  padding: '5px 10px',
  background: 'rgba(124, 92, 255, 0.1)',
  border: '1px solid rgba(124, 92, 255, 0.25)',
  borderRadius: 4,
};

const clusterLabelStyle = {
  fontSize: 9,
  fontFamily: 'var(--font-pixel)',
  color: 'var(--text-dim)',
  letterSpacing: '1px',
  textTransform: 'uppercase',
};

const clusterValueStyle = {
  color: 'var(--accent-glow)',
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
  display: 'flex',
  alignItems: 'center',
};
