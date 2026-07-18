import { Music2 } from 'lucide-react';

const MAX_VISIBLE_SONGS = 6;

/** Queue projection for the sidebar; selecting a row preserves its original queue index. */
export function UpNextPanel({ songs = [], onSelect }) {
  const visibleSongs = songs.slice(0, MAX_VISIBLE_SONGS);
  return (
    <section className="radio-sidebar-section up-next-panel" aria-labelledby="up-next-title">
      <div className="radio-sidebar-title-row">
        <h2 className="radio-sidebar-title" id="up-next-title">UP NEXT</h2>
        <span className="radio-sidebar-count">{songs.length}</span>
      </div>
      {visibleSongs.length === 0 ? (
        <p className="radio-sidebar-empty">QUEUE IS REFILLING</p>
      ) : (
        <div className="up-next-list">
          {visibleSongs.map((song, index) => (
            <button type="button" className="up-next-item" key={song.id || `${song.title}:${index}`}
              aria-label={`Play ${song.title || 'Unknown Track'} next`} onClick={() => onSelect?.(index)}>
              <span className="up-next-index">{String(index + 1).padStart(2, '0')}</span>
              <span className="up-next-icon"><Music2 size={15} aria-hidden="true" /></span>
              <span className="up-next-copy">
                <span className="up-next-title">{song.title || 'Unknown Track'}</span>
                <span className="up-next-artist">{song.artist || 'Unknown Artist'}</span>
              </span>
              <span className="up-next-duration">{formatDuration(song.durationMs)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function formatDuration(durationMs) {
  const totalSeconds = Math.max(0, Math.floor((durationMs || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
