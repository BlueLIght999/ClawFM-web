import { useState, useEffect, useCallback } from 'react';

export default function PlaylistList({ onPlay, socket }) {
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const fetchPlaylists = useCallback(() => {
    fetch('/api/playlists')
      .then(r => r.json())
      .then(data => {
        setPlaylists(data.playlists || []);
        setLoading(false);
      })
      .catch(e => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchPlaylists();
  }, [fetchPlaylists]);

  // Refresh playlists whenever queue is updated (songs added/removed)
  useEffect(() => {
    if (!socket) return;
    const handler = () => fetchPlaylists();
    socket.on('radio:queue-update', handler);
    return () => socket.off('radio:queue-update', handler);
  }, [socket, fetchPlaylists]);

  const handlePlay = useCallback(async (playlist) => {
    try {
      const res = await fetch(`/api/playlist/${playlist.id}/play`, { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        onPlay?.(playlist);
      }
    } catch (e) {
      setError(e.message);
    }
  }, [onPlay]);

  return (
    <div className="pixel-border" style={{
      margin: '0 0 4px 0', background: 'var(--bg-secondary)', overflow: 'hidden',
    }}>
      <button onClick={() => setExpanded(!expanded)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '5px 10px', background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--text-primary)', fontFamily: 'var(--font-pixel)', fontSize: 10, letterSpacing: '1px',
      }}>
        <span style={{ color: 'var(--neon-cyan)' }}>{expanded ? '[-]' : '[+]'} {'PLAYLISTS'}</span>
        <span style={{ color: 'var(--text-dim)', fontSize: 9 }}>{playlists.length} {'LISTS'}</span>
      </button>

      {expanded && (
        <div style={{ maxHeight: 160, overflowY: 'auto', borderTop: '1px solid var(--border-dim)' }}>
          {loading && (
            <div style={{ padding: 10, textAlign: 'center', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 16 }}>{'Loading...'}</div>
          )}
          {error && (
            <div style={{ padding: 10, textAlign: 'center', color: 'var(--neon-pink)', fontFamily: 'var(--font-mono)', fontSize: 15 }}>{error}</div>
          )}
          {!loading && !error && playlists.length === 0 && (
            <div style={{ padding: 10, textAlign: 'center', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 16 }}>{'No playlists found.'}</div>
          )}
          {!loading && playlists.map((p) => (
            <button key={p.id} onClick={() => handlePlay(p)}
              title={`${p.name} — ${p.trackCount} ${'tracks'}`}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '4px 10px', background: 'none', border: 'none',
                borderBottom: '1px solid var(--border-dim)', cursor: 'pointer',
                color: 'var(--text-primary)', textAlign: 'left',
                fontFamily: 'var(--font-mono)', fontSize: 15, transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-primary)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
            >
              <span style={{
                width: 22, height: 22, background: 'var(--bg-primary)',
                border: '1px solid var(--border-dim)', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                fontSize: 10, flexShrink: 0, color: 'var(--accent)',
              }}>{'>'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-pixel)', fontSize: 9, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 1 }}>{p.trackCount} {'tracks'}</div>
              </div>
              <span style={{ fontFamily: 'var(--font-pixel)', fontSize: 8, color: 'var(--accent)', flexShrink: 0 }}>{'PLAY'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
