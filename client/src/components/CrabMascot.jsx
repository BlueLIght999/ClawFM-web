import { useCallback, useEffect, useRef, useState } from 'react';
import './crab.css';

const STATE_MAP = {
  idle: 'default',
  bouncing: 'play',
  talking: 'play',
  loading: 'loading',
  listening: 'listening',
};

export default function CrabMascot({ state, onInteract }) {
  const specState = STATE_MAP[state] || 'default';
  const prevState = useRef(state);
  const [animPhase, setAnimPhase] = useState('idle');
  const animTimer = useRef(null);

  useEffect(() => {
    const prev = prevState.current;
    prevState.current = state;

    // Clear any pending phase timer
    if (animTimer.current) { clearTimeout(animTimer.current); animTimer.current = null; }

    if (state === 'listening' && prev !== 'listening') {
      // Transitioning in: claws up → headphones appear → claws down
      setAnimPhase('in');
      animTimer.current = setTimeout(() => setAnimPhase('active'), 900);
    } else if (state !== 'listening' && prev === 'listening') {
      // Transitioning out: claws up → headphones disappear → claws down
      setAnimPhase('out');
      animTimer.current = setTimeout(() => setAnimPhase('idle'), 900);
    } else if (state === 'listening') {
      // Already listening (re-render)
      setAnimPhase('active');
    } else {
      setAnimPhase('idle');
    }

    return () => {
      if (animTimer.current) clearTimeout(animTimer.current);
    };
  }, [state]);

  const handleCrabClick = useCallback(() => {
    onInteract?.('chat');
  }, [onInteract]);

  const animClass = animPhase === 'in' ? 'crab-anim-in'
    : animPhase === 'out' ? 'crab-anim-out'
    : animPhase === 'active' ? 'crab-anim-active'
    : '';

  return (
    <div
      className={`crab-state-${specState} crab-mascot ${animClass}`}
      onClick={handleCrabClick}
      style={{
        width: 120,
        height: 120,
        position: 'relative',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <svg viewBox="0 0 200 200" width="120" height="120"
        shapeRendering="crispEdges"
        style={{ display: 'block', imageRendering: 'pixelated' }}
      >
        {/* Body: 80×60 centered, fill #F28C63 */}
        <rect x="60" y="75" width="80" height="60" fill="#F28C63" />

        {/* Eyes (open) — default state */}
        <g className="g g-default">
          <rect x="80" y="85" width="10" height="20" fill="#000000" />
          <rect x="110" y="85" width="10" height="20" fill="#000000" />
        </g>

        {/* Eyes (closed) + Headphones — listening state */}
        <g className="g g-listening">
          {/* Closed eyes — downward arcs */}
          <path d="M 79 93 Q 85 97 91 93" stroke="#000000" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M 109 93 Q 115 97 121 93" stroke="#000000" strokeWidth="3" fill="none" strokeLinecap="round" />

          {/* Headband */}
          <rect x="58" y="71" width="84" height="6" fill="#666666" />
          <rect x="59" y="70" width="82" height="1" fill="#666666" />
          <rect x="59" y="77" width="82" height="1" fill="#666666" />

          {/* Left earcup */}
          <rect x="44" y="77" width="16" height="22" fill="#666666" />
          <rect x="45" y="76" width="14" height="1" fill="#666666" />
          <rect x="45" y="99" width="14" height="1" fill="#666666" />

          {/* Right earcup */}
          <rect x="140" y="77" width="16" height="22" fill="#666666" />
          <rect x="141" y="76" width="14" height="1" fill="#666666" />
          <rect x="141" y="99" width="14" height="1" fill="#666666" />

          {/* Left bracket */}
          <rect x="58" y="77" width="6" height="10" fill="#666666" />
          <rect x="59" y="76" width="4" height="1" fill="#666666" />

          {/* Right bracket */}
          <rect x="136" y="77" width="6" height="10" fill="#666666" />
          <rect x="137" y="76" width="4" height="1" fill="#666666" />

          {/* Colored floating eighth notes */}
          <g className="listen-note-1">
            <rect x="150" y="54" width="2" height="12" fill="#4488FF" />
            <rect x="147" y="63" width="8" height="4" fill="#4488FF" />
            <rect x="150" y="55" width="5" height="2" fill="#4488FF" />
            <rect x="151" y="57" width="3" height="2" fill="#4488FF" />
          </g>
          <g className="listen-note-2">
            <rect x="38" y="52" width="2" height="12" fill="#FF8844" />
            <rect x="33" y="61" width="8" height="4" fill="#FF8844" />
            <rect x="33" y="53" width="5" height="2" fill="#FF8844" />
            <rect x="34" y="55" width="3" height="2" fill="#FF8844" />
          </g>
          <g className="listen-note-3">
            <rect x="152" y="108" width="2" height="12" fill="#CC66FF" />
            <rect x="149" y="117" width="8" height="4" fill="#CC66FF" />
            <rect x="152" y="109" width="5" height="2" fill="#CC66FF" />
            <rect x="153" y="111" width="3" height="2" fill="#CC66FF" />
          </g>
          <g className="listen-note-4">
            <rect x="34" y="104" width="2" height="12" fill="#44DDBB" />
            <rect x="29" y="113" width="8" height="4" fill="#44DDBB" />
            <rect x="29" y="105" width="5" height="2" fill="#44DDBB" />
            <rect x="30" y="107" width="3" height="2" fill="#44DDBB" />
          </g>
        </g>

        {/* Claws: 16×20, seamless with body sides */}
        <rect className="claw-left" x="44" y="95" width="16" height="20" fill="#F28C63" />
        <rect className="claw-right" x="140" y="95" width="16" height="20" fill="#F28C63" />

        {/* Legs: 4 blocks 10×20, evenly distributed */}
        <rect x="66" y="135" width="10" height="20" fill="#F28C63" />
        <rect x="82" y="135" width="10" height="20" fill="#F28C63" />
        <rect x="108" y="135" width="10" height="20" fill="#F28C63" />
        <rect x="124" y="135" width="10" height="20" fill="#F28C63" />

        {/* Base: 90×8, fill #888888 */}
        <rect x="55" y="160" width="90" height="8" fill="#888888" />

        {/* STATE: play — small eighth notes */}
        <g className="g g-play">
          <rect x="150" y="74" width="2" height="12" fill="#000000" />
          <rect x="147" y="83" width="8" height="4" fill="#000000" />
          <rect x="150" y="75" width="5" height="2" fill="#000000" />
          <rect x="151" y="77" width="3" height="2" fill="#000000" />
          <rect x="150" y="94" width="2" height="12" fill="#000000" />
          <rect x="147" y="103" width="8" height="4" fill="#000000" />
          <rect x="150" y="95" width="5" height="2" fill="#000000" />
          <rect x="151" y="97" width="3" height="2" fill="#000000" />
        </g>

        {/* STATE: loading — eighth notes floating toward mouth */}
        <g className="g g-loading">
          <g className="note-1">
            <rect x="0" y="0" width="2" height="12" fill="#000000" />
            <rect x="-3" y="9" width="8" height="4" fill="#000000" />
            <rect x="0" y="1" width="5" height="2" fill="#000000" />
            <rect x="1" y="3" width="3" height="2" fill="#000000" />
          </g>
          <g className="note-2">
            <rect x="0" y="0" width="2" height="14" fill="#000000" />
            <rect x="-3" y="11" width="8" height="4" fill="#000000" />
            <rect x="0" y="1" width="5" height="2" fill="#000000" />
            <rect x="1" y="3" width="3" height="2" fill="#000000" />
          </g>
          <g className="note-3">
            <rect x="0" y="0" width="2" height="10" fill="#000000" />
            <rect x="-2" y="7" width="7" height="4" fill="#000000" />
            <rect x="0" y="1" width="4" height="2" fill="#000000" />
            <rect x="1" y="3" width="2" height="2" fill="#000000" />
          </g>
          <g className="note-4">
            <rect x="0" y="0" width="2" height="13" fill="#000000" />
            <rect x="-3" y="10" width="8" height="4" fill="#000000" />
            <rect x="0" y="1" width="5" height="2" fill="#000000" />
            <rect x="1" y="3" width="3" height="2" fill="#000000" />
          </g>
        </g>
      </svg>

      {/* Label */}
      <div style={{
        position: 'absolute', bottom: 2, width: '100%', textAlign: 'center',
        fontFamily: 'var(--font-pixel)', fontSize: 8,
        color: '#F28C63', opacity: 0.5, letterSpacing: '2px',
      }}>
        {state === 'loading' ? 'TUNING...'
          : state === 'talking' ? 'ON AIR'
          : state === 'bouncing' ? String.fromCodePoint(0x266A, 0x266A, 0x266A)
          : state === 'listening' ? '♪ LISTENING ♪'
          : 'CLAWED'}
      </div>
    </div>
  );
}
