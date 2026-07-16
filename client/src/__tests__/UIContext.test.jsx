import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UIProvider, useUI } from '../contexts/UIContext.jsx';

// Mock fetch
global.fetch = vi.fn(() => Promise.resolve({
  json: () => Promise.resolve({})
}));

function TestConsumer() {
  const {
    view, setView, weather, proactiveEnabled, toggleProactive,
    error, setError,
  } = useUI();
  return (
    <div>
      <span data-testid="view">{view}</span>
      <span data-testid="weather">{weather}</span>
      <span data-testid="proactive">{String(proactiveEnabled)}</span>
      <span data-testid="error">{error || 'none'}</span>
      <button onClick={() => setView('settings')}>Settings</button>
      <button onClick={toggleProactive}>ToggleProactive</button>
      <button onClick={() => setError('Test error')}>SetError</button>
    </div>
  );
}

describe('UIContext', () => {
  it('starts with player view and proactive enabled', () => {
    render(<UIProvider socket={null}><TestConsumer /></UIProvider>);
    expect(screen.getByTestId('view').textContent).toBe('player');
    expect(screen.getByTestId('proactive').textContent).toBe('true');
  });

  it('setView changes view', () => {
    render(<UIProvider socket={null}><TestConsumer /></UIProvider>);
    fireEvent.click(screen.getByText('Settings'));
    expect(screen.getByTestId('view').textContent).toBe('settings');
  });

  it('toggleProactive flips state and emits event', () => {
    const emit = vi.fn();
    render(<UIProvider socket={{ emit }}><TestConsumer /></UIProvider>);
    fireEvent.click(screen.getByText('ToggleProactive'));
    expect(screen.getByTestId('proactive').textContent).toBe('false');
    expect(emit).toHaveBeenCalledWith('proactive:toggle', { enabled: false });
  });

  it('setError sets error', () => {
    render(<UIProvider socket={null}><TestConsumer /></UIProvider>);
    fireEvent.click(screen.getByText('SetError'));
    expect(screen.getByTestId('error').textContent).toBe('Test error');
  });
});
