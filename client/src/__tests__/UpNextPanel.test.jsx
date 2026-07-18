import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { UpNextPanel } from '../components/agent-radio/UpNextPanel.jsx';

describe('UpNextPanel', () => {
  it('rendersAtMostSixSongs_usingStableSongFields', () => {
    const songs = Array.from({ length: 8 }, (_, index) => ({
      id: `song-${index}`,
      title: `Track ${index}`,
      artist: `Artist ${index}`,
      durationMs: 180000 + index * 1000,
    }));

    render(<UpNextPanel songs={songs} />);

    expect(screen.getAllByRole('button')).toHaveLength(6);
    expect(screen.getByText('Track 0')).toBeInTheDocument();
    expect(screen.getByText('3:00')).toBeInTheDocument();
    expect(screen.queryByText('Track 6')).not.toBeInTheDocument();
  });

  it('selectsSongByQueueIndex', () => {
    const onSelect = vi.fn();
    render(<UpNextPanel songs={[{ id: 'a', title: 'A', artist: 'Artist', durationMs: 120000 }]} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button', { name: 'Play A next' }));

    expect(onSelect).toHaveBeenCalledWith(0);
  });

  it('rendersEmptyState_whenQueueIsEmpty', () => {
    render(<UpNextPanel songs={[]} />);

    expect(screen.getByText('QUEUE IS REFILLING')).toBeInTheDocument();
  });
});
