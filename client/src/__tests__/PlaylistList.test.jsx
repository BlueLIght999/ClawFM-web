import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PlaylistList from '../components/PlaylistList.jsx';

describe('PlaylistList', () => {
  afterEach(() => vi.unstubAllGlobals());

  const createPlaylists = count => Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `PLAYLIST ${index + 1}`,
    trackCount: index + 1,
  }));

  it('rendersSidebarVariantExpanded_withRealPlaylistData', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ playlists: [{ id: 'p1', name: 'MIDNIGHT FLIGHT', trackCount: 12 }] }),
    }));

    render(<PlaylistList variant="sidebar" defaultExpanded />);

    expect(await screen.findByText('MIDNIGHT FLIGHT')).toBeInTheDocument();
    expect(screen.getByText('12 tracks')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'PLAYLISTS' })).toBeInTheDocument();
  });

  it('playsPlaylist_throughExistingEndpoint', async () => {
    const onPlay = vi.fn();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ json: () => Promise.resolve({ playlists: [{ id: 'p1', name: 'P1', trackCount: 1 }] }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<PlaylistList variant="sidebar" defaultExpanded onPlay={onPlay} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Play P1' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/playlist/p1/play', { method: 'POST' }));
    expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }));
  });

  it('limitsSidebarToFivePlaylists_untilMoreIsRequested', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ playlists: createPlaylists(7) }),
    }));

    render(<PlaylistList variant="sidebar" />);

    expect(await screen.findByText('PLAYLIST 5')).toBeInTheDocument();
    expect(screen.queryByText('PLAYLIST 6')).not.toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show all playlists' }));

    expect(screen.getByText('PLAYLIST 7')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show fewer playlists' })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Show fewer playlists' }));
    expect(screen.queryByText('PLAYLIST 6')).not.toBeInTheDocument();
  });

  it('keepsAllPlaylistsInExpandedCollapsibleMode', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ playlists: createPlaylists(7) }),
    }));

    render(<PlaylistList defaultExpanded />);

    expect(await screen.findByText('PLAYLIST 7')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show all playlists' })).not.toBeInTheDocument();
  });
});
