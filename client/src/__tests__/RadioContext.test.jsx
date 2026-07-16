import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RadioProvider, useRadio } from '../contexts/RadioContext.jsx';

function TestConsumer() {
  const { radioState, skip, previous, pause, resume, setMode, updateRadioState } = useRadio();
  return (
    <div>
      <span data-testid="playing">{String(radioState.isPlaying)}</span>
      <span data-testid="mode">{radioState.queueMode}</span>
      <button onClick={skip}>Skip</button>
      <button onClick={previous}>Prev</button>
      <button onClick={pause}>Pause</button>
      <button onClick={resume}>Resume</button>
      <button onClick={() => setMode('sequential')}>Seq</button>
      <button onClick={() => updateRadioState({ isPlaying: true })}>Play</button>
    </div>
  );
}

describe('RadioContext', () => {
  it('initializes with default radio state', () => {
    render(<RadioProvider socket={null}><TestConsumer /></RadioProvider>);
    expect(screen.getByTestId('playing').textContent).toBe('false');
    expect(screen.getByTestId('mode').textContent).toBe('shuffle');
  });

  it('emits player:skip on skip()', () => {
    const emit = vi.fn();
    render(<RadioProvider socket={{ emit }}><TestConsumer /></RadioProvider>);
    screen.getByText('Skip').click();
    expect(emit).toHaveBeenCalledWith('player:skip');
  });

  it('emits player:pause on pause()', () => {
    const emit = vi.fn();
    render(<RadioProvider socket={{ emit }}><TestConsumer /></RadioProvider>);
    screen.getByText('Pause').click();
    expect(emit).toHaveBeenCalledWith('player:pause');
  });

  it('emits player:set-mode on setMode()', () => {
    const emit = vi.fn();
    render(<RadioProvider socket={{ emit }}><TestConsumer /></RadioProvider>);
    screen.getByText('Seq').click();
    expect(emit).toHaveBeenCalledWith('player:set-mode', { mode: 'sequential' });
  });

  it('updateRadioState merges partial state', () => {
    render(<RadioProvider socket={null}><TestConsumer /></RadioProvider>);
    fireEvent.click(screen.getByText('Play'));
    expect(screen.getByTestId('playing').textContent).toBe('true');
  });
});
