import DJSchedule from './DJSchedule.jsx';

/**
 * ProfileView — user profile & DJ schedule view.
 * Extracted from App.jsx for code splitting.
 */
export default function ProfileView({ profileData, plan, socket, onRefreshPlan }) {
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 10 }}>
      <h2 className="pixel-title" style={{ marginBottom: 10, fontSize: 12 }}>PROFILE & SCHEDULE</h2>
      <div className="pixel-border" style={{
        background: 'var(--bg-secondary)', padding: '8px 12px', marginBottom: 8,
      }}>
        {profileData ? (
          <div style={{ display: 'flex', gap: 20, fontFamily: 'var(--font-mono)', fontSize: 16 }}>
            <div>
              <span style={{ color: 'var(--text-dim)' }}>Mood: </span>
              <span style={{ color: 'var(--accent-glow)' }}>{profileData.currentMood}</span>
            </div>
            <div>
              <span style={{ color: 'var(--text-dim)' }}>Songs played: </span>
              <span style={{ color: 'var(--text-primary)' }}>{profileData.totalSongs || 0}</span>
            </div>
            {profileData.topArtists?.length > 0 && (
              <div style={{ flex: 1 }}>
                <span style={{ color: 'var(--text-dim)' }}>Top: </span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {profileData.topArtists.slice(0, 5).map(a => a.name).join(', ')}
                </span>
              </div>
            )}
          </div>
        ) : (
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--text-dim)' }}>Loading taste data...</p>
        )}
      </div>
      <DJSchedule plan={plan} socket={socket} activeBlockIndex={plan?.activeBlockIndex} onRefresh={onRefreshPlan} />
    </div>
  );
}
