import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import LyricsDisplay from '../components/LyricsDisplay.jsx';

const lyricResponse = {
  lrc: '[00:00.00]First line\n[00:10.00]Current line\n[00:20.00]Last line',
  tlrc: '[00:10.00]Current translation',
};

describe('LyricsDisplay', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('centersTheActiveLineInsideItsOwnScrollViewport', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve(lyricResponse),
    }));
    const { rerender } = render(
      <LyricsDisplay songId="song-1" song={{ id: 'song-1' }} elapsed={0} isPlaying />,
    );

    const viewport = await screen.findByRole('region', { name: 'Lyrics' });
    const activeLine = screen.getByText('Current line').closest('[data-lyric-index]');
    const scrollTo = vi.fn();
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 120 });
    Object.defineProperty(viewport, 'scrollTo', { configurable: true, value: scrollTo });
    Object.defineProperty(activeLine, 'offsetTop', { configurable: true, value: 180 });
    Object.defineProperty(activeLine, 'offsetHeight', { configurable: true, value: 24 });

    rerender(
      <LyricsDisplay songId="song-1" song={{ id: 'song-1' }} elapsed={12} isPlaying />,
    );

    await waitFor(() => expect(activeLine).toHaveAttribute('aria-current', 'true'));
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 132, behavior: 'smooth' });
    expect(screen.getByText('Current translation')).toBeInTheDocument();
  });

  it('rendersAnUnclippedPixelBorderedViewport', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve(lyricResponse),
    }));

    render(<LyricsDisplay songId="song-1" song={{ id: 'song-1' }} elapsed={0} isPlaying={false} />);

    const viewport = await screen.findByRole('region', { name: 'Lyrics' });
    expect(viewport).toHaveClass('lyrics-display', 'pixel-border');
    expect(viewport).toHaveAttribute('tabindex', '0');
  });

  it('keepsTheEmptyStateInsideTheSameStableFrame', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ lrc: '', tlrc: '' }),
    }));

    render(<LyricsDisplay songId="song-1" song={{ id: 'song-1' }} elapsed={0} isPlaying={false} />);

    expect(await screen.findByText('No lyrics available')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Lyrics' })).toHaveClass('lyrics-display-empty');
  });
});
