import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TastePanel } from '../components/agent-radio/TastePanel.jsx';

describe('TastePanel', () => {
  it('rendersGenresArtistsMoodAndWeather_fromTasteSummary', () => {
    render(
      <TastePanel
        data={{
          topGenres: [{ name: 'Indie' }, 'Ambient'],
          topArtists: [{ name: 'M83' }, { name: 'Oh Wonder' }],
          currentMood: 'chill',
        }}
        weather="Clear 28C"
      />
    );

    expect(screen.getByText('Indie')).toBeInTheDocument();
    expect(screen.getByText('Ambient')).toBeInTheDocument();
    expect(screen.getByText('M83')).toBeInTheDocument();
    expect(screen.getByText('chill')).toBeInTheDocument();
    expect(screen.getByText('Clear 28C')).toBeInTheDocument();
  });

  it('rendersStableLoadingErrorAndEmptyStates', () => {
    const { rerender } = render(<TastePanel loading />);
    expect(screen.getByText('TUNING PROFILE...')).toBeInTheDocument();

    rerender(<TastePanel error="offline" />);
    expect(screen.getByText('PROFILE OFFLINE')).toBeInTheDocument();

    rerender(<TastePanel data={{ topGenres: [], topArtists: [], currentMood: '' }} />);
    expect(screen.getByText('LISTEN MORE TO SHAPE YOUR TASTE')).toBeInTheDocument();
  });
});
