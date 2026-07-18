import LoginOverlay from './LoginOverlay.jsx';

export function LoginGate({ connected, socket, error, onPhoneLogin, onQrLogin }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)', flexDirection: 'column', gap: 20 }}>
        <div style={{ fontSize: 36 }}>🦀</div>
        <h1 style={{ fontFamily: 'var(--font-pixel)', fontSize: 18, color: 'var(--accent)' }}>Qclaudio 88.7</h1>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--text-secondary)' }}>Connected: {String(connected)} | Auth: checking...</p>
        <LoginOverlay onPhoneLogin={onPhoneLogin} onQrLogin={onQrLogin} connected={connected} socket={socket} error={error} />
      </div>
    </div>
  );
}
