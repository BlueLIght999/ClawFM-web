import { useState, useEffect } from 'react';

export default function DJBooth({ message }) {
  const [visible, setVisible] = useState(false);
  const [displayText, setDisplayText] = useState('');

  useEffect(() => {
    if (message) {
      setVisible(true);
      setDisplayText(message);
      const timer = setTimeout(() => setVisible(false), 12000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  if (!visible) return (
    <div style={{
      height: 18,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <span className="pixel-text" style={{ fontSize: 6, color: 'var(--text-dim)' }}>
        ON AIR
      </span>
    </div>
  );

  return (
    <div className="pixel-border-accent" style={{
      padding: '4px 10px',
      background: 'rgba(224, 123, 86, 0.05)',
      textAlign: 'center',
      animation: 'fadeIn 0.3s',
    }}>
      <span style={{
        fontFamily: 'var(--font-pixel)', fontSize: 5, color: 'var(--accent)',
        textTransform: 'uppercase', marginRight: 8,
      }}>DJ</span>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent-glow)',
      }}>
        {displayText}
      </span>
    </div>
  );
}
