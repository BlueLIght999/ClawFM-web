import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ColdStartOverlay } from '../components/ColdStartOverlay.jsx';

vi.mock('../components/CrabMascot.jsx', () => ({
  default: ({ state }) => <div data-testid="crab" data-state={state} />,
}));

describe('ColdStartOverlay', () => {
  it('rendersNull_whenNotLoading', () => {
    const { container } = render(
      <ColdStartOverlay isColdLoading={false} coldPhase="done" coldPhaseText="" coldOpenText="" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('rendersQcladioTitle_whenLoading', () => {
    render(
      <ColdStartOverlay isColdLoading={true} coldPhase="loading" coldPhaseText="" coldOpenText="" />,
    );
    expect(screen.getByText('QCLADIO 88.7')).toBeInTheDocument();
  });

  it('rendersShowtimeTitle_whenExit', () => {
    render(
      <ColdStartOverlay isColdLoading={true} coldPhase="exit" coldPhaseText="" coldOpenText="" />,
    );
    expect(screen.getByText('SHOWTIME!')).toBeInTheDocument();
  });

  it('showsColdOpenText_whenProvided', () => {
    render(
      <ColdStartOverlay isColdLoading={true} coldPhase="loading" coldPhaseText="fallback" coldOpenText="Hello DJ" />,
    );
    expect(screen.getByText('Hello DJ')).toBeInTheDocument();
  });

  it('fallsBackToColdPhaseText_whenColdOpenTextEmpty', () => {
    render(
      <ColdStartOverlay isColdLoading={true} coldPhase="loading" coldPhaseText="Warming up" coldOpenText="" />,
    );
    expect(screen.getByText('Warming up')).toBeInTheDocument();
  });

  it('showsDefaultText_whenNeitherProvided', () => {
    render(
      <ColdStartOverlay isColdLoading={true} coldPhase="loading" coldPhaseText="" coldOpenText="" />,
    );
    expect(screen.getByText('CLAWED is warming up the decks...')).toBeInTheDocument();
  });

  it('showsExitText_whenPhaseIsExit', () => {
    render(
      <ColdStartOverlay isColdLoading={true} coldPhase="exit" coldPhaseText="" coldOpenText="" />,
    );
    expect(screen.getByText('CLAWED is ready to drop the beat...')).toBeInTheDocument();
  });

  it('passesBouncingStateToCrab_whenExit', () => {
    render(
      <ColdStartOverlay isColdLoading={true} coldPhase="exit" coldPhaseText="" coldOpenText="" />,
    );
    expect(screen.getByTestId('crab').dataset.state).toBe('bouncing');
  });

  it('passesLoadingStateToCrab_whenLoading', () => {
    render(
      <ColdStartOverlay isColdLoading={true} coldPhase="loading" coldPhaseText="" coldOpenText="" />,
    );
    expect(screen.getByTestId('crab').dataset.state).toBe('loading');
  });
});
