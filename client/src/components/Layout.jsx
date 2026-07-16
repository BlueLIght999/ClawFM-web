export default function Layout({ crab, djDialog, djDialogVisible, spectrum, chat, chatOpen, error }) {
  // When dialog is visible (and chat closed), crab slides left to make room
  const crabSlideLeft = djDialogVisible && !chatOpen;

  return (
    <div style={{
      flex: '0 0 auto',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
      padding: '6px 12px',
      position: 'relative',
    }}>
      {error && (
        <div style={{
          position: 'absolute', top: 2, left: '50%', transform: 'translateX(-50%)',
          background: '#1a0000', border: '1px solid #ff3333', color: '#ff3333',
          padding: '1px 8px', fontSize: 13, fontFamily: 'var(--font-mono)', zIndex: 100,
        }}>ERR: {error}</div>
      )}

      <div style={{
        position: 'relative', width: '100%',
        minHeight: chatOpen ? 200 : 140,
        display: 'flex', alignItems: 'flex-start',
      }}>
        <div style={{
          position: 'absolute',
          left: chatOpen ? '0px' : (crabSlideLeft ? '10px' : '50%'),
          transform: chatOpen ? 'translateX(0)' : (crabSlideLeft ? 'translateX(0)' : 'translateX(-50%)'),
          transition: 'left 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)',
          zIndex: 2, willChange: 'left, transform', marginTop: 2,
          display: 'flex', alignItems: 'center',
        }}>
          {crab}
          {djDialog}
        </div>
        {chatOpen && (
          <div className="chat-panel-enter" style={{
            flex: 1, marginLeft: 150, zIndex: 1, maxWidth: 520,
          }}>{chat}</div>
        )}
      </div>

      <div style={{ flex: '0 0 auto', zIndex: 1, width: '100%' }}>{spectrum}</div>
    </div>
  );
}
