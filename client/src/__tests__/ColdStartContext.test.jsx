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

  it('emitsClientReady_whenSocketAndConnectedAndLoggedIn', () => {
    const socket = { emit: vi.fn() };
    render(
      <ColdStartProvider socket={socket} connected={true} loggedIn={true}>
        <TestConsumer />
      </ColdStartProvider>,
    );
    expect(socket.emit).toHaveBeenCalledWith('client:ready');
  });

  it('doesNotEmitClientReady_whenNotConnected', () => {
    const socket = { emit: vi.fn() };
    render(
      <ColdStartProvider socket={socket} connected={false} loggedIn={true}>
        <TestConsumer />
      </ColdStartProvider>,
    );
    expect(socket.emit).not.toHaveBeenCalledWith('client:ready');
  });

  it('doesNotEmitClientReady_whenNotLoggedIn', () => {
    const socket = { emit: vi.fn() };
    render(
      <ColdStartProvider socket={socket} connected={true} loggedIn={false}>
        <TestConsumer />
      </ColdStartProvider>,
    );
    expect(socket.emit).not.toHaveBeenCalledWith('client:ready');
  });

  it('callsOnDeferredSpeech_whenPhaseBecomesDone_andPendingSpeechExists', () => {
    vi.useFakeTimers();
    const onDeferredSpeech = vi.fn();
    let ctxRef = null;
    function SetSpeechConsumer() {
      const ctx = useColdStart();
      ctxRef = ctx;
      return null;
    }
    render(
      <ColdStartProvider onDeferredSpeech={onDeferredSpeech}>
        <SetSpeechConsumer />
        <TestConsumer />
      </ColdStartProvider>,
    );
    // Set a pending speech URL
    act(() => {
      ctxRef.pendingSpeechRef.current = 'http://example.com/speech.mp3';
    });
    // Transition to exit → done
    fireEvent.click(screen.getByText('Exit'));
    act(() => { vi.advanceTimersByTime(900); });
    expect(onDeferredSpeech).toHaveBeenCalledWith('http://example.com/speech.mp3');
    // pendingSpeechRef should be cleared after callback
    expect(ctxRef.pendingSpeechRef.current).toBeNull();
    vi.useRealTimers();
  });

  it('doesNotCallOnDeferredSpeech_whenNoPendingSpeech', () => {
    vi.useFakeTimers();
    const onDeferredSpeech = vi.fn();
    render(
      <ColdStartProvider onDeferredSpeech={onDeferredSpeech}>
        <TestConsumer />
      </ColdStartProvider>,
    );
    fireEvent.click(screen.getByText('Exit'));
    act(() => { vi.advanceTimersByTime(900); });
    expect(onDeferredSpeech).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
