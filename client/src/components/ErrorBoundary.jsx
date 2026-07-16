import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // In production, this is where you'd send to Sentry/LogRocket
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100vh', gap: 16,
          background: 'var(--bg-primary)', fontFamily: 'var(--font-pixel)',
        }}>
          <div style={{ fontSize: 48 }}>🦀</div>
          <div style={{ fontSize: 14, color: 'var(--neon-pink)', letterSpacing: '2px' }}>
            SIGNAL Lost
          </div>
          <div style={{
            fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)',
            maxWidth: 400, textAlign: 'center',
          }}>
            {this.state.error?.message || 'Unknown transmission error'}
          </div>
          <button
            onClick={this.handleRetry}
            style={{
              fontFamily: 'var(--font-pixel)', fontSize: 10, letterSpacing: '1px',
              padding: '6px 16px', border: '1px solid var(--accent)',
              background: 'transparent', color: 'var(--accent)', cursor: 'pointer',
            }}
          >
            RETRY
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
