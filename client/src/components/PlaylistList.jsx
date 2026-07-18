import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, ChevronUp, Play } from 'lucide-react';
import { E } from '../constants/events.js';

const SIDEBAR_PLAYLIST_LIMIT = 5;

/** Playlist browser backed by the existing playlist REST endpoints. */
export default function PlaylistList({
  onPlay,
  socket,
  variant = 'collapsible',
  defaultExpanded = false,
}) {
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showAllSidebar, setShowAllSidebar] = useState(false);
  const sidebar = variant === 'sidebar';
  const contentVisible = sidebar || expanded;
  const sidebarPlaylists = showAllSidebar
    ? playlists
    : playlists.slice(0, SIDEBAR_PLAYLIST_LIMIT);
  const canToggleSidebar = !loading && !error && playlists.length > SIDEBAR_PLAYLIST_LIMIT;

  const fetchPlaylists = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch('/api/playlists')
      .then(response => response.json())
      .then(data => setPlaylists(data.playlists || []))
      .catch(requestError => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchPlaylists();
  }, [fetchPlaylists]);

  useEffect(() => {
    if (!socket) return undefined;
    socket.on(E.QUEUE_UPDATE, fetchPlaylists);
    return () => socket.off(E.QUEUE_UPDATE, fetchPlaylists);
  }, [socket, fetchPlaylists]);

  const handlePlay = useCallback(async (playlist) => {
    try {
      const response = await fetch(`/api/playlist/${playlist.id}/play`, { method: 'POST' });
      const data = await response.json();
      if (data.ok) onPlay?.(playlist);
    } catch (requestError) {
      setError(requestError.message);
    }
  }, [onPlay]);

  if (sidebar) {
    return (
      <section className="radio-sidebar-section playlist-panel" aria-labelledby="playlist-title">
        <div className="radio-sidebar-title-row">
          <h2 className="radio-sidebar-title" id="playlist-title">PLAYLISTS</h2>
          <span className="radio-sidebar-count">{playlists.length}</span>
        </div>
        <PlaylistContent playlists={sidebarPlaylists} loading={loading} error={error} onPlay={handlePlay} />
        {canToggleSidebar && (
          <button type="button" className="playlist-more"
            aria-expanded={showAllSidebar}
            aria-label={showAllSidebar ? 'Show fewer playlists' : 'Show all playlists'}
            onClick={() => setShowAllSidebar(value => !value)}>
            <span>{showAllSidebar ? 'LESS' : 'MORE'}</span>
            {showAllSidebar
              ? <ChevronUp size={13} aria-hidden="true" />
              : <ChevronRight size={13} aria-hidden="true" />}
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="pixel-border playlist-panel playlist-panel-collapsible">
      <button type="button" className="playlist-toggle" onClick={() => setExpanded(value => !value)}
        aria-expanded={expanded}>
        <span>{expanded ? '[-]' : '[+]'} PLAYLISTS</span>
        <span>{playlists.length} LISTS</span>
      </button>
      {contentVisible && <PlaylistContent playlists={playlists} loading={loading} error={error} onPlay={handlePlay} />}
    </section>
  );
}

function PlaylistContent({ playlists, loading, error, onPlay }) {
  if (loading) return <p className="radio-sidebar-empty">LOADING PLAYLISTS...</p>;
  if (error) return <p className="radio-sidebar-empty playlist-error">{error}</p>;
  if (playlists.length === 0) return <p className="radio-sidebar-empty">NO PLAYLISTS FOUND</p>;

  return (
    <div className="playlist-items">
      {playlists.map(playlist => (
        <button type="button" className="playlist-item" key={playlist.id}
          aria-label={`Play ${playlist.name}`} onClick={() => onPlay(playlist)}>
          {playlist.coverImgUrl ? (
            <img className="playlist-cover" src={playlist.coverImgUrl} alt="" />
          ) : (
            <span className="playlist-cover playlist-cover-fallback"><Play size={14} aria-hidden="true" /></span>
          )}
          <span className="playlist-copy">
            <span className="playlist-name">{playlist.name}</span>
            <span className="playlist-meta">{playlist.trackCount || 0} tracks</span>
          </span>
          <span className="playlist-play-label">PLAY</span>
        </button>
      ))}
    </div>
  );
}
