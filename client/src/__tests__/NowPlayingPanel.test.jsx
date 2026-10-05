import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NowPlayingPanel } from '../components/agent-radio/NowPlayingPanel.jsx';

describe('NowPlayingPanel', () => {
  const song = {
    id: 'song-1',
    title: 'Sunset Lover',
    artist: 'Petit Biscuit',
    album: 'Presence',
    coverUrl: 'https://example.com/cover.jpg',
    durationMs: 239000,
  };

  it('rendersStableSongFields_andCover', () => {
    render(<NowPlayingPanel song={song} />);

    expect(screen.getByText('Sunset Lover')).toBeInTheDocument();
    expect(screen.getByText('Petit Biscuit')).toBeInTheDocument();
    expect(screen.getByText('Presence')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Sunset Lover cover' })).toHaveAttribute('src', song.coverUrl);
  });

  it('usesCoverFallback_whenCoverIsMissing', () => {
    render(<NowPlayingPanel song={{ ...song, coverUrl: '' }} />);

    expect(screen.getByTestId('now-playing-cover-fallback')).toBeInTheDocument();
  });

  it('wiresTransportControls_toExistingCallbacks', () => {
    const onPrevious = vi.fn();
    const onPause = vi.fn();
    const onSkip = vi.fn();
    render(
      <NowPlayingPanel song={song} isPlaying onPrevious={onPrevious} onPause={onPause} onSkip={onSkip} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Previous track' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next track' }));

    expect(onPrevious).toHaveBeenCalledOnce();
    expect(onPause).toHaveBeenCalledOnce();
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it('disablesTransportControls_whenSongIsEmpty', () => {
    render(<NowPlayingPanel song={null} />);

    expect(screen.getByText('WAITING FOR SIGNAL')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous track' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next track' })).toBeDisabled();
  });
  // F4「成员点赞某歌 → 推给同簇其他人」
  it('likeButton_callsOnLike_andShowsLikedState', () => {
    const onLike = vi.fn();
    const { rerender } = render(<NowPlayingPanel song={song} onLike={onLike} />);

    fireEvent.click(screen.getByRole('button', { name: 'Like song' }));
    expect(onLike).toHaveBeenCalledOnce();

    rerender(<NowPlayingPanel song={song} onLike={onLike} liked />);
    expect(screen.getByRole('button', { name: 'Liked' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('likeButton_isHidden_withoutAnOnLikeHandler', () => {
    // 不是社区成员时不给入口：点了也只会拿到 not_member
    render(<NowPlayingPanel song={song} />);
    expect(screen.queryByRole('button', { name: 'Like song' })).toBeNull();
  });

  it('likeButton_isDisabled_whenSongIsEmpty', () => {
    render(<NowPlayingPanel song={null} onLike={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Like song' })).toBeDisabled();
  });
});
