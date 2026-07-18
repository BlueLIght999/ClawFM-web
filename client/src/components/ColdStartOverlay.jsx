import CrabMascot from './CrabMascot.jsx';

export function ColdStartOverlay({ isColdLoading, coldPhase, coldPhaseText, coldOpenText }) {
  if (!isColdLoading) return null;

  const isExit = coldPhase === 'exit';

  return (
    <div
      className={`cold-overlay ${isExit ? 'cold-exit' : ''}`}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-primary)', flexDirection: 'column', gap: 16,
        pointerEvents: 'none',
      }}
    >
      <CrabMascot state={isExit ? 'bouncing' : 'loading'} />
      <div style={{ fontFamily: 'var(--font-pixel)', fontSize: 10, color: 'var(--accent)', letterSpacing: '2px' }}>
        {isExit ? 'SHOWTIME!' : 'QCLADIO 88.7'}
      </div>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: coldOpenText ? 16 : 15,
        color: coldOpenText ? 'var(--accent-glow)' : 'var(--text-dim)',
        textAlign: 'center',
        maxWidth: coldOpenText ? 340 : 260,
        lineHeight: coldOpenText ? 1.6 : 1.4,
        padding: coldOpenText ? '0 16px' : 0,
        maxHeight: coldOpenText ? 120 : undefined,
        overflow: 'hidden',
      }}>
        {isExit ? 'CLAWED is ready to drop the beat...' : (coldOpenText || coldPhaseText || 'CLAWED is warming up the decks...')}
      </div>
    </div>
  );
}
