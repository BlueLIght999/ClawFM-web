import { useState, useRef, useEffect } from 'react';

/* Mini pixel crab avatar — 4px pixel, simplified 8x10 grid */
function CrabAvatar() {
  const s = '4px';
  return (
    <div style={{
      width: 32, height: 40, flexShrink: 0, position: 'relative', marginTop: 2,
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 4, width: s, height: s,
        boxShadow: [
          /* claws row 1 */
          `${1*s} 0 0 #E07B56`, `${2*s} 0 0 #E07B56`,
          `${5*s} 0 0 #E07B56`, `${6*s} 0 0 #E07B56`,
          /* eyes */
          `${2*s} ${2*s} 0 #fff`, `${3*s} ${2*s} 0 #fff`,
          `${5*s} ${2*s} 0 #fff`, `${6*s} ${2*s} 0 #fff`,
          /* pupils */
          `${2*s} ${3*s} 0 #111`, `${3*s} ${3*s} 0 #111`,
          `${5*s} ${3*s} 0 #111`, `${6*s} ${3*s} 0 #111`,
          /* face */
          `${2*s} ${4*s} 0 #C56B3F`, `${3*s} ${4*s} 0 #C56B3F`,
          `${4*s} ${4*s} 0 #E07B56`,
          `${5*s} ${4*s} 0 #C56B3F`, `${6*s} ${4*s} 0 #C56B3F`,
          /* body */
          `${1*s} ${5*s} 0 #E07B56`, `${2*s} ${5*s} 0 #F4A885`,
          `${3*s} ${5*s} 0 #F4A885`, `${4*s} ${5*s} 0 #F4A885`,
          `${5*s} ${5*s} 0 #F4A885`, `${6*s} ${5*s} 0 #E07B56`, `${7*s} ${5*s} 0 #C56B3F`,
          `${1*s} ${6*s} 0 #E07B56`, `${2*s} ${6*s} 0 #E07B56`,
          `${3*s} ${6*s} 0 #C56B3F`, `${4*s} ${6*s} 0 #C56B3F`,
          `${5*s} ${6*s} 0 #C56B3F`, `${6*s} ${6*s} 0 #E07B56`, `${7*s} ${6*s} 0 #E07B56`,
          /* legs */
          `0 ${7*s} 0 #C56B3F`, `${1*s} ${7*s} 0 #C56B3F`,
          `${6*s} ${7*s} 0 #C56B3F`, `${7*s} ${7*s} 0 #C56B3F`,
        ].join(','),
      }} />
    </div>
  );
}

function UserAvatar() {
  return (
    <div style={{
      width: 28, height: 28, flexShrink: 0,
      border: '2px solid var(--neon-cyan)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-pixel)', fontSize: 8, color: 'var(--neon-cyan)',
      imageRendering: 'pixelated',
    }}>U</div>
  );
}

export default function ChatBox({ messages, onSend, isOpen, onToggle }) {
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 400);
    }
  }, [isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSend(input.trim());
    setInput('');
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="pixel-border chat-panel-enter" style={{
      display: 'flex',
      flexDirection: 'column',
      height: 220,
      maxHeight: 220,
      background: 'var(--bg-secondary)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '4px 8px',
        borderBottom: '1px solid var(--border-dim)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <CrabAvatar />
          <span className="pixel-text" style={{ fontSize: 9, color: 'var(--accent)' }}>
            DJ DAN
          </span>
        </div>
        <button onClick={() => onToggle?.(false)} style={{
          background: 'none', border: 'none', color: 'var(--text-dim)',
          cursor: 'pointer', fontSize: 16, fontFamily: 'var(--font-mono)',
        }}>[X]</button>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflow: 'auto', padding: '6px 8px',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 15, marginTop: 10 }}>
            Ask the DJ anything...<br />
            "Play something chill"<br />
            "Who is this artist?"<br />
            "What's playing next?"
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{
            display: 'flex',
            gap: 6,
            flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
            alignItems: 'flex-start',
          }}>
            {/* Avatar */}
            {msg.role === 'assistant' ? <CrabAvatar /> : <UserAvatar />}

            <div style={{ maxWidth: '75%' }}>
              <span style={{
                fontFamily: 'var(--font-pixel)', fontSize: 8,
                color: msg.role === 'user' ? 'var(--neon-cyan)' : 'var(--accent)',
                display: 'block', marginBottom: 2,
              }}>
                {msg.role === 'user' ? 'YOU' : msg.isTransition ? 'TRANSITION' : 'DJ DAN'}
              </span>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 15,
                color: msg.role === 'user' ? 'var(--text-secondary)' : 'var(--accent-glow)',
                background: msg.role === 'user' ? 'rgba(0,204,255,0.06)' : 'rgba(224,123,86,0.08)',
                border: `1px solid ${msg.role === 'user' ? 'rgba(0,204,255,0.2)' : 'rgba(224,123,86,0.2)'}`,
                padding: '4px 8px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {msg.content}
                {i === messages.length - 1 && msg.role === 'assistant' && <span className="cursor-blink" />}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} style={{
        display: 'flex', borderTop: '1px solid var(--border-dim)',
      }}>
        <input
          ref={inputRef}
          className="pixel-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="> Type message..."
          style={{
            flex: 1, border: 'none',
            borderRight: '1px solid var(--border-dim)', fontSize: 15,
          }}
        />
        <button type="submit" className="pixel-btn" style={{ fontSize: 11, flexShrink: 0 }}>SEND</button>
      </form>
    </div>
  );
}
