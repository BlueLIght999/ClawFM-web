import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PlayerBar from '../components/PlayerBar.jsx';

const defaultProps = {
  song: { id: '1', title: 'Stable Title', name: 'Legacy Name', artist: 'Artist' },
  isPlaying: true,
  elapsed: 30,
  duration: 180,
  mode: 'shuffle',
  musicAudioRef: { current: null },
  upcomingSongs: [{ id: '2', title: 'Next', artist: 'Next Artist' }],
  onSkip: vi.fn(),
  onPrevious: vi.fn(),
  onPause: vi.fn(),
  onResume: vi.fn(),
  onSetMode: vi.fn(),
  socket: { emit: vi.fn() },
};

describe('PlayerBar', () => {
  it('readsStableTitle_insteadOfLegacyName', () => {
    render(<PlayerBar {...defaultProps} />);
    expect(screen.getByText('Stable Title')).toBeInTheDocument();
    expect(screen.queryByText('Legacy Name')).not.toBeInTheDocument();
  });

  it('hidesInlineQueue_whenShowInlineQueueIsFalse', () => {
    render(<PlayerBar {...defaultProps} showInlineQueue={false} />);
    expect(screen.queryByText(/NEXT \(1\)/)).not.toBeInTheDocument();
  });

  it('keepsInlineQueueByDefault_forBackwardCompatibility', () => {
    render(<PlayerBar {...defaultProps} />);
    expect(screen.getByText(/NEXT \(1\)/)).toBeInTheDocument();
  });
});
