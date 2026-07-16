import { useState, useEffect, useRef } from 'react';

export default function LoginOverlay({ onPhoneLogin, onQrLogin, connected, socket, error }) {
  const [tab, setTab] = useState('phone');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [qrImage, setQrImage] = useState(null);
  const [qrStatus, setQrStatus] = useState('');
  const qrKeyRef = useRef(null);

  // Listen for QR code events from server
  useEffect(() => {
    if (!socket) return;

    socket.on('auth:qr-created', (data) => {
      qrKeyRef.current = data.key;
      if (data.qrimg) {
        setQrImage(data.qrimg);
      } else if (data.qrUrl) {
        // Fallback: generate QR from URL using external API
        setQrImage(`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(data.qrUrl)}`);
      }
      setQrStatus('Waiting for scan...');
    });

    socket.on('auth:qr-status', (data) => {
      if (data.status === 'waiting-scan') setQrStatus('Waiting for scan...');
      else if (data.status === 'scanned') setQrStatus('Scanned! Confirm on your phone...');
    });

    socket.on('auth:qr-expired', () => {
      setQrImage(null);
      setQrStatus('QR code expired. Click "QR Login" to refresh.');
      qrKeyRef.current = null;
    });

    socket.on('auth:login-success', () => {
      setQrStatus('Logged in!');
      setLoading(false);
      setLoginError('');
      if (qrKeyRef.current?._phoneTimeout) clearTimeout(qrKeyRef.current._phoneTimeout);
    });

    socket.on('radio:error', (err) => {
      // 6-digit numeric error codes per ERROR-HANDLING.md
      // 10402=AUTH_LOGIN_FAILED, 10301=AUTH_QR_POLL_FAILED, 10303=AUTH_QR_CREATE_FAILED
      const isAuthError = err?.code === 10402 || err?.code === 10301 || err?.code === 10303;
      if (isAuthError) {
        setLoading(false);
        if (qrKeyRef.current?._phoneTimeout) clearTimeout(qrKeyRef.current._phoneTimeout);
        setLoginError(err.message || 'Login failed');
        const isQrError = err?.code === 10301 || err?.code === 10303;
        if (isQrError) {
          setQrImage(null);
          setQrStatus('QR failed. Click button to retry.');
        }
      }
    });

    return () => {
      socket.off('auth:qr-created');
      socket.off('auth:qr-status');
      socket.off('auth:qr-expired');
      socket.off('auth:login-success');
      socket.off('radio:error');
    };
  }, [socket]);

  const handleQrClick = () => {
    setTab('qr');
    setQrImage(null);
    setLoginError('');
    setQrStatus('Generating QR code...');
    onQrLogin();
  };

  const handlePhoneSubmit = (e) => {
    e.preventDefault();
    if (!phone || !password) return;
    setLoading(true);
    setLoginError('');
    onPhoneLogin(phone, password);
    // Safety timeout: if no response in 15s, reset loading state
    if (qrKeyRef.current._phoneTimeout) clearTimeout(qrKeyRef.current._phoneTimeout);
    qrKeyRef.current._phoneTimeout = setTimeout(() => {
      setLoading(false);
      setLoginError('Login timed out — please retry');
    }, 15000);
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: 'var(--bg-primary)',
      flexDirection: 'column',
      gap: 30,
    }}>
      {/* Logo area */}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontSize: 48,
          marginBottom: 12,
          filter: 'drop-shadow(0 0 20px rgba(224,123,86,0.5))',
        }}>
          🦀
        </div>
        <h1 className="pixel-title" style={{ fontSize: 22 }}>
          Qclaudio 88.7
        </h1>
        <p className="pixel-text" style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 8 }}>
          24/7 AI-POWERED RADIO STATION
        </p>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8,
        }}>
          <span style={{ width: 6, height: 6, background: connected ? '#00ccff' : '#ff3333', boxShadow: connected ? '0 0 6px #00ccff' : '0 0 6px #ff3333' }} />
          <span style={{ fontFamily: 'var(--font-pixel)', fontSize: 8, color: connected ? '#00ccff' : '#ff3333' }}>
            {connected ? 'SERVER ONLINE' : 'SERVER OFFLINE'}
          </span>
        </div>
      </div>

      {/* Login box */}
      <div className="pixel-border-accent" style={{
        padding: 20,
        width: 360,
        background: 'var(--bg-secondary)',
      }}>
        {/* Tabs */}
        <div style={{ display: 'flex', marginBottom: 16, gap: 0 }}>
          <button
            onClick={() => setTab('phone')}
            className="pixel-btn"
            style={{
              flex: 1,
              borderBottom: tab === 'phone' ? '2px solid var(--accent)' : '2px solid transparent',
              fontSize: 8,
            }}
          >
            PHONE LOGIN
          </button>
          <button
            onClick={handleQrClick}
            className="pixel-btn"
            style={{
              flex: 1,
              borderBottom: tab === 'qr' ? '2px solid var(--accent)' : '2px solid transparent',
              fontSize: 8,
            }}
          >
            QR LOGIN
          </button>
        </div>

        {tab === 'phone' ? (
          <form onSubmit={handlePhoneSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="pixel-text" style={{ fontSize: 7, display: 'block', marginBottom: 4, color: 'var(--text-secondary)' }}>
                PHONE NUMBER
              </label>
              <input
                className="pixel-input"
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="138xxxxxxxx"
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label className="pixel-text" style={{ fontSize: 7, display: 'block', marginBottom: 4, color: 'var(--text-secondary)' }}>
                PASSWORD
              </label>
              <input
                className="pixel-input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="********"
                style={{ width: '100%' }}
              />
            </div>
            <button type="submit" className="pixel-btn accent" style={{ width: '100%', fontSize: 13, padding: '10px' }} disabled={loading}>
              {loading ? 'CONNECTING...' : 'LOGIN TO NETEASE'}
            </button>
            {(loginError || error) && (
              <p className="pixel-text" style={{ fontSize: 7, color: '#ff6b6b', textAlign: 'center', marginTop: 4 }}>
                {loginError || error}
              </p>
            )}
          </form>
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 20 }}>
            <p className="pixel-text" style={{ fontSize: 8 }}>
              SCAN QR CODE WITH
              <br />
              NETEASE MUSIC APP
            </p>
            <div style={{
              width: 150, height: 150, margin: '12px auto 0',
              border: '2px dashed var(--border-dim)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--text-dim)',
              background: qrImage ? '#fff' : 'transparent',
            }}>
              {qrImage ? (
                <img src={qrImage} alt="QR Code" style={{ width: 140, height: 140 }} />
              ) : (
                <span style={{ fontSize: 10, padding: 8, textAlign: 'center' }}>{qrStatus || 'QR HERE'}</span>
              )}
            </div>
            {loginError && tab === 'qr' && (
              <p className="pixel-text" style={{ fontSize: 7, color: '#ff6b6b', textAlign: 'center', marginTop: 8 }}>
                {loginError}
              </p>
            )}
            <button
              onClick={handleQrClick}
              className="pixel-btn"
              style={{ fontSize: 7, marginTop: 8, padding: '4px 12px' }}
            >
              {qrImage ? 'REFRESH QR' : 'RETRY QR'}
            </button>
            <p className="pixel-text" style={{ fontSize: 6, marginTop: 8, color: qrStatus ? 'var(--text-secondary)' : 'var(--text-dim)' }}>
              {qrStatus || "Click \"QR Login\" again if expired"}
            </p>
          </div>
        )}
      </div>

      <p className="pixel-text" style={{ fontSize: 8, color: 'var(--text-dim)', textAlign: 'center', maxWidth: 360 }}>
        Your NetEase credentials are sent only to the local server.
        <br />
        Cookie is stored locally. No third-party involved.
      </p>
    </div>
  );
}
