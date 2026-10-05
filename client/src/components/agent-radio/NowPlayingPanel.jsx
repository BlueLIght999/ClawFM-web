import { Heart, Pause, Play, SkipBack, SkipForward } from 'lucide-react';

/**
 * Compact current-song summary wired to the existing playback callbacks.
 *
 * onLike 只在当前用户是社区成员时传入（F4 点赞某歌 → 推给同簇其他人）；
 * 不传就不给入口，免得点了只拿到 not_member。
 */
export function NowPlayingPanel({ song, isPlaying = false, onPrevious, onPause, onResume, onSkip, onLike, liked = false }) {
  const hasSong = Boolean(song?.id || song?.title);
  const title = song?.title || 'WAITING FOR SIGNAL';

  return (
    <section className="now-playing-panel" aria-label="Now playing">
      <Cover song={song} title={title} />
      <div className="now-playing-copy">
        <div className="now-playing-label"><span aria-hidden="true" />NOW PLAYING</div>
        <div className="now-playing-title" title={title}>{title}</div>
        <div className="now-playing-artist">{song?.artist || 'QCLAUDIO 88.7'}</div>
        {song?.album && <div className="now-playing-album">{song.album}</div>}
      </div>
      <div className="now-playing-controls">
        <TransportButton label="Previous track" disabled={!hasSong} onClick={onPrevious} icon={SkipBack} />
        <TransportButton
          label={isPlaying ? 'Pause' : 'Resume'}
          disabled={!hasSong}
          onClick={isPlaying ? onPause : onResume}
          icon={isPlaying ? Pause : Play}
          primary
        />
        <TransportButton label="Next track" disabled={!hasSong} onClick={onSkip} icon={SkipForward} />
        {onLike && (
          <button type="button" className={`radio-icon-button${liked ? ' liked' : ''}`}
            aria-label={liked ? 'Liked' : 'Like song'} title={liked ? 'Liked' : 'Like song'}
            aria-pressed={liked} disabled={!hasSong} onClick={onLike}>
            <Heart size={17} strokeWidth={2.2} fill={liked ? 'currentColor' : 'none'} aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  );
}

function Cover({ song, title }) {
  if (song?.coverUrl) {
    return <img className="now-playing-cover" src={song.coverUrl} alt={`${title} cover`} />;
  }
  return <div className="now-playing-cover now-playing-cover-fallback" data-testid="now-playing-cover-fallback" aria-hidden="true">♪</div>;
}

function TransportButton({ label, disabled, onClick, icon: Icon, primary = false }) {
  return (
    <button type="button" className={`radio-icon-button${primary ? ' primary' : ''}`}
      aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      <Icon size={primary ? 20 : 17} strokeWidth={2.2} aria-hidden="true" />
    </button>
  );
}
