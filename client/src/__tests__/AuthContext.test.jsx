import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../contexts/AuthContext.jsx';

// Mock fetch
global.fetch = vi.fn(() => Promise.resolve({
  json: () => Promise.resolve({ loggedIn: false })
}));

function TestConsumer() {
  const { loggedIn, loginPhone, loginQr, logout } = useAuth();
  return (
    <div>
      <span data-testid="status">{String(loggedIn)}</span>
      <button onClick={() => loginPhone('13800001234', 'pass')}>Phone</button>
      <button onClick={() => loginQr()}>QR</button>
      <button onClick={logout}>Logout</button>
    </div>
  );
}

describe('AuthContext', () => {
  it('starts with loggedIn=false', () => {
    render(
      <AuthProvider socket={null}>
        <TestConsumer />
      </AuthProvider>
    );
    expect(screen.getByTestId('status').textContent).toBe('false');
  });

  it('emits auth:login-phone on loginPhone', () => {
    const emit = vi.fn();
    render(
      <AuthProvider socket={{ emit }}>
        <TestConsumer />
      </AuthProvider>
    );
    screen.getByText('Phone').click();
    expect(emit).toHaveBeenCalledWith('auth:login-phone', { phone: '13800001234', password: 'pass' });
  });

  it('emits auth:login-qr-start on loginQr', () => {
    const emit = vi.fn();
    render(
      <AuthProvider socket={{ emit }}>
        <TestConsumer />
      </AuthProvider>
    );
    screen.getByText('QR').click();
    expect(emit).toHaveBeenCalledWith('auth:login-qr-start');
  });

  it('starts with loggedIn=false and logout keeps it false', () => {
    render(
      <AuthProvider socket={{ emit: vi.fn() }}>
        <TestConsumer />
      </AuthProvider>
    );
    expect(screen.getByTestId('status').textContent).toBe('false');
    screen.getByText('Logout').click();
    expect(screen.getByTestId('status').textContent).toBe('false');
  });
});
