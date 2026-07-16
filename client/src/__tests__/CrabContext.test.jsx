import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CrabProvider, useCrab } from '../contexts/CrabContext.jsx';

function TestConsumer() {
  const { crabState, setCrabState, bubbles, setBubbles, bubblesVisible, setBubblesVisible } = useCrab();
  return (
    <div>
      <span data-testid="crab">{crabState}</span>
      <span data-testid="bubbles-count">{bubbles.length}</span>
      <span data-testid="bubbles-visible">{String(bubblesVisible)}</span>
      <button onClick={() => setCrabState('bouncing')}>Bounce</button>
      <button onClick={() => setBubbles([{ tag: 'jpop' }])}>AddBubble</button>
      <button onClick={() => setBubblesVisible(true)}>ShowBubbles</button>
    </div>
  );
}

describe('CrabContext', () => {
  it('starts with idle crab and empty bubbles', () => {
    render(<CrabProvider isPlaying={false}><TestConsumer /></CrabProvider>);
    expect(screen.getByTestId('crab').textContent).toBe('idle');
    expect(screen.getByTestId('bubbles-count').textContent).toBe('0');
    expect(screen.getByTestId('bubbles-visible').textContent).toBe('false');
  });

  it('setCrabState updates crab state', () => {
    render(<CrabProvider isPlaying={false}><TestConsumer /></CrabProvider>);
    fireEvent.click(screen.getByText('Bounce'));
    expect(screen.getByTestId('crab').textContent).toBe('bouncing');
  });

  it('setBubbles updates bubbles array', () => {
    render(<CrabProvider isPlaying={false}><TestConsumer /></CrabProvider>);
    fireEvent.click(screen.getByText('AddBubble'));
    expect(screen.getByTestId('bubbles-count').textContent).toBe('1');
  });

  it('setBubblesVisible updates visibility', () => {
    render(<CrabProvider isPlaying={false}><TestConsumer /></CrabProvider>);
    fireEvent.click(screen.getByText('ShowBubbles'));
    expect(screen.getByTestId('bubbles-visible').textContent).toBe('true');
  });
});
