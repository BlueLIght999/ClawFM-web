import { THEME_NAMES } from '../theme/themes.js';

/**
 * SettingsView — settings panel view.
 * Extracted from App.jsx for code splitting.
 */
export default function SettingsView({
  queueMode, onSetMode, proactiveEnabled, onProactiveToggle,
  theme, override, setThemeOverride, clearOverride, ttsStatus,
}) {
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 10 }}>
      <h2 className="pixel-title" style={{ marginBottom: 8, fontSize: 12 }}>SETTINGS</h2>
      <div className="pixel-border" style={{ background: 'var(--bg-secondary)', padding: '8px 12px', marginBottom: 8 }}>
        <p style={{ fontFamily: 'var(--font-pixel)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 6 }}>QUEUE MODE</p>
        <div style={{ display: 'flex', gap: 4 }}>
          {['sequential', 'shuffle', 'fm'].map(m => (
            <button key={m} className={`pixel-btn ${queueMode === m ? 'accent' : ''}`}
              onClick={() => onSetMode(m)} style={{ fontSize: 9 }}>{m.toUpperCase()}</button>
          ))}
        </div>
      </div>
      <div className="pixel-border" style={{ background: 'var(--bg-secondary)', padding: '8px 12px', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontFamily: 'var(--font-pixel)', fontSize: 10, color: 'var(--text-dim)', margin: '0 0 2px 0' }}>DJ PROACTIVE SPEECH</p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: 'var(--text-dim)', margin: 0 }}>Autonomous DJ chat messages (~40% spoken aloud)</p>
          </div>
          <button
            className={`pixel-btn ${proactiveEnabled ? 'accent' : ''}`}
            onClick={onProactiveToggle}
            style={{ fontSize: 9, minWidth: 50 }}
          >{proactiveEnabled ? 'ON' : 'OFF'}</button>
        </div>
      </div>
      <div className="pixel-border" style={{ background: 'var(--bg-secondary)', padding: '8px 12px', marginBottom: 8 }}>
        <p style={{ fontFamily: 'var(--font-pixel)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 6 }}>THEME</p>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className={`pixel-btn ${override === null ? 'accent' : ''}`}
            onClick={clearOverride} style={{ fontSize: 9 }}>AUTO</button>
          {THEME_NAMES.map(t => (
            <button key={t} className={`pixel-btn ${theme === t ? 'accent' : ''}`}
              onClick={() => override === t ? clearOverride() : setThemeOverride(t)}
              style={{ fontSize: 9 }}>
              {t.toUpperCase()}{override === t ? ' *' : ''}
            </button>
          ))}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: 'var(--text-dim)', marginLeft: 4 }}>
            {override ? `Locked: ${override}` : `Auto (${theme})`}
          </span>
        </div>
      </div>
      <div className="pixel-border" style={{ background: 'var(--bg-secondary)', padding: '8px 12px' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--text-secondary)', margin: 0 }}>
          TTS: {ttsStatus.available === false
            ? 'Offline (text-only)'
            : ttsStatus.provider === 'edge'
              ? 'Edge TTS (fallback)'
              : ttsStatus.provider === 'dashscope'
                ? 'DashScope (Ethan)'
                : 'Checking...'}
        </p>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>AI: DeepSeek V4 Pro</p>
      </div>
    </div>
  );
}
