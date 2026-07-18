import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoginGate } from '../components/LoginGate.jsx';

vi.mock('../components/LoginOverlay.jsx', () => ({
  default: ({ connected, error, onPhoneLogin, onQrLogin }) => (
    <div data-testid="login-overlay" data-connected={String(connected)} data-error={String(error ?? '')} >
      <button data-testid="phone-btn" onClick={onPhoneLogin}>Phone</button>
      <button data-testid="qr-btn" onClick={onQrLogin}>QR</button>
    </div>
  ),
}));

describe('LoginGate', () => {
  const defaultProps = {
    connected: true,
    socket: { emit: vi.fn() },
    error: null,
    onPhoneLogin: vi.fn(),
    onQrLogin: vi.fn(),
  };

  it('rendersCrabEmoji', () => {
    render(<LoginGate {...defaultProps} />);
    expect(screen.getByText('🦀')).toBeInTheDocument();
  });

  it('rendersStationTitle', () => {
    render(<LoginGate {...defaultProps} />);
    expect(screen.getByText('Qclaudio 88.7')).toBeInTheDocument();
  });

  it('rendersConnectedStatus_whenConnected', () => {
    render(<LoginGate {...defaultProps} connected={true} />);
    expect(screen.getByText(/Connected: true/)).toBeInTheDocument();
  });

  it('rendersDisconnectedStatus_whenNotConnected', () => {
    render(<LoginGate {...defaultProps} connected={false} />);
    expect(screen.getByText(/Connected: false/)).toBeInTheDocument();
  });

  it('passesPropsToLoginOverlay', () => {
    const onPhone = vi.fn();
    const onQr = vi.fn();
    render(
      <LoginGate
        connected={false}
        socket={null}
        error="Login failed"
        onPhoneLogin={onPhone}
        onQrLogin={onQr}
      />,
    );
    const overlay = screen.getByTestId('login-overlay');
    expect(overlay.dataset.connected).toBe('false');
    expect(overlay.dataset.error).toBe('Login failed');
  });

  it('forwardsPhoneLoginCallback', () => {
    const onPhone = vi.fn();
    render(<LoginGate {...defaultProps} onPhoneLogin={onPhone} />);
    screen.getByTestId('phone-btn').click();
    expect(onPhone).toHaveBeenCalledOnce();
  });

  it('forwardsQrLoginCallback', () => {
    const onQr = vi.fn();
    render(<LoginGate {...defaultProps} onQrLogin={onQr} />);
    screen.getByTestId('qr-btn').click();
    expect(onQr).toHaveBeenCalledOnce();
  });
});
