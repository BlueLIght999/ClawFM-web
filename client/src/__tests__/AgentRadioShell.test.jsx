import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentRadioShell } from '../components/agent-radio/AgentRadioShell.jsx';

describe('AgentRadioShell', () => {
  it('rendersNamedRegions_inPrototypeOrder', () => {
    render(
      <AgentRadioShell
        nowPlaying={<span>now</span>}
        spectrum={<span>spectrum</span>}
        agent={<span>agent</span>}
        lyrics={<span>lyrics</span>}
        player={<span>player</span>}
        taste={<span>taste</span>}
        playlists={<span>playlists</span>}
        upNext={<span>up-next</span>}
      />
    );

    expect(screen.getByTestId('agent-radio-main')).toBeInTheDocument();
    expect(screen.getByTestId('agent-radio-sidebar')).toBeInTheDocument();
    expect(screen.getAllByTestId(/agent-radio-region-/).map(node => node.dataset.region)).toEqual([
      'now-playing', 'spectrum', 'agent', 'lyrics', 'player', 'taste', 'playlists', 'up-next',
    ]);
  });

  it('rendersErrorBanner_whenErrorExists', () => {
    render(<AgentRadioShell error="socket lost" />);

    expect(screen.getByRole('alert')).toHaveTextContent('socket lost');
  });
});
