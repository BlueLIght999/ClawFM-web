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
});
