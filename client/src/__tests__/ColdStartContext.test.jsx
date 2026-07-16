import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ColdStartProvider, useColdStart } from '../contexts/ColdStartContext.jsx';

function TestConsumer() {
  const { coldPhase, setColdPhase, isColdLoading } = useColdStart();
  return (
    <div>
      <span data-testid="phase">{coldPhase}</span>
      <span data-testid="loading">{String(isColdLoading)}</span>
      <button onClick={() => setColdPhase('exit')}>Exit</button>
      <button onClick={() => setColdPhase('done')}>Done</button>
    </div>
  );
}

describe('ColdStartContext', () => {
  it('starts in loading phase', () => {
    render(<ColdStartProvider><TestConsumer /></ColdStartProvider>);
    expect(screen.getByTestId('phase').textContent).toBe('loading');
    expect(screen.getByTestId('loading').textContent).toBe('true');
  });

  it('isColdLoading is false when phase is done', () => {
    render(<ColdStartProvider><TestConsumer /></ColdStartProvider>);
    fireEvent.click(screen.getByText('Done'));
    expect(screen.getByTestId('loading').textContent).toBe('false');
  });

  it('isColdLoading is true when phase is exit', () => {
    render(<ColdStartProvider><TestConsumer /></ColdStartProvider>);
    fireEvent.click(screen.getByText('Exit'));
    expect(screen.getByTestId('loading').textContent).toBe('true');
  });

  it('transitions from exit to done after 900ms', async () => {
    vi.useFakeTimers();
    render(<ColdStartProvider><TestConsumer /></ColdStartProvider>);
    fireEvent.click(screen.getByText('Exit'));
    expect(screen.getByTestId('phase').textContent).toBe('exit');
    act(() => { vi.advanceTimersByTime(900); });
    expect(screen.getByTestId('phase').textContent).toBe('done');
    vi.useRealTimers();
  });
});
