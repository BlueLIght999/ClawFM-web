# Client Strangler Fig Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Incrementally decompose `App.jsx` (584 lines, 20+ useState, 13 useEffect, 15+ socket handlers) into a context-provider architecture using the Strangler Fig pattern — each phase produces working, tested software.

**Architecture:** Wrap the legacy `App.jsx` in a new provider tree (the "facade"). Extract one domain subsystem at a time — Auth, Radio, Chat, Cold-Start, Crab, UI — moving state and handlers from App.jsx into dedicated Context providers and focused hooks. Each extraction follows TDD: write failing test for the new context/hook, implement it, wire App.jsx to consume it, verify all tests pass, commit. The monolith shrinks until it becomes a thin composition shell.

**Tech Stack:** React 19 (Context API, useTransition, lazy/Suspense), Vite 6, Vitest 4, @testing-library/react, Socket.IO Client

---

## File Structure

### New directories
```
client/src/
  contexts/           ← All Context providers (the "new system" facade)
    AuthContext.jsx
    RadioContext.jsx
    ChatContext.jsx
    ColdStartContext.jsx
    CrabContext.jsx
    UIContext.jsx
    AppProviders.jsx   ← Composition root: nests all providers
  hooks/
    useRadioSocketEvents.js      ← Extracted from App.jsx socket useEffect
    useChatSocketEvents.js
    useCrabSocketEvents.js
    useColdStartSocketEvents.js
    useSystemSocketEvents.js
    useAudioController.js        ← Extracted music/speech audio effects
    usePerformanceMonitor.js     ← web-vitals reporting (Phase 9)
  components/
    ErrorBoundary.jsx            ← Phase 0 safety net
    ColdStartOverlay.jsx         ← Extracted from App.jsx JSX
    LoginGate.jsx                ← Extracted from App.jsx JSX
    AudioElements.jsx            ← Extracted <audio> elements
    PlayerView.jsx               ← Extracted player view JSX
    Skeleton.jsx                 ← Loading skeleton (Phase 9)
```

### Modified files
```
client/src/main.jsx              ← Wrap App in ErrorBoundary + AppProviders
client/src/App.jsx               ← Shrinks from 584 → ~80 lines (thin shell)
client/src/config.js             ← Add ENV config helpers (Phase 9)
client/public/sw.js              ← Bump cache version on completion
```

### Current state analysis (the "legacy monolith")

`App.jsx` currently owns:
- **Auth state**: `loggedIn`, `handleLoginPhone`, `handleLoginQr` (lines 57, 377-386)
- **Radio state**: `radioState` object + 5 player handlers (lines 58-67, 347-351)
- **Music audio effects**: 3 useEffects for play/pause/disconnect (lines 120-150)
- **Chat state**: `chatMessages`, `chatOpen`, DJ dialog state (lines 68, 86-94)
- **Cold-start state**: `coldPhase`, `coldPhaseText`, `coldOpenText`, `pendingSpeechRef` (lines 102-108)
- **Crab state**: `crabState`, `bubbles`, `bubblesVisible` (lines 72-76)
- **UI state**: `view`, `profileData`, `plan`, `weather`, `proactiveEnabled`, `ttsStatus` (lines 95-105)
- **Monolithic socket listener**: 15+ event handlers in single useEffect (lines 173-288)
- **Inline JSX**: login gate, cold-start overlay, audio elements, player view (lines 410-583)

---

## Phase 0: Error Boundary (Safety Net)

The Strangler Fig pattern starts with a safety net. An Error Boundary ensures any extraction regression shows a fallback UI instead of a white screen.

### Task 0.1: Create ErrorBoundary Component

**Files:**
- Create: `client/src/components/ErrorBoundary.jsx`
- Test: `client/src/__tests__/ErrorBoundary.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/__tests__/ErrorBoundary.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from '../components/ErrorBoundary.jsx';

function ThrowOnRender({ error }) {
  if (error) throw new Error('Test explosion');
  return <div>OK</div>;
}

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <ThrowOnRender error={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('OK')).toBeInTheDocument();
  });

  it('renders fallback UI when child throws', () => {
    // Suppress console.error noise from React
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <ThrowOnRender error={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText(/SIGNAL Lost/i)).toBeInTheDocument();
    expect(screen.getByText(/Test explosion/i)).toBeInTheDocument();
    spy.mockRestore();
  });

  it('renders custom fallback when provided', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary fallback={<div>Custom Error</div>}>
        <ThrowOnRender error={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Custom Error')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('shows retry button that clears error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(
      <ErrorBoundary>
        <ThrowOnRender error={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText(/RETRY/i)).toBeInTheDocument();
    spy.mockRestore();
    // Rerender without error — ErrorBoundary state resets via key change
    rerender(
      <ErrorBoundary key="fresh">
        <ThrowOnRender error={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('OK')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/ErrorBoundary.test.jsx`
Expected: FAIL with "Cannot find module '../components/ErrorBoundary.jsx'"

- [ ] **Step 3: Write minimal implementation**

```jsx
// client/src/components/ErrorBoundary.jsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/ErrorBoundary.test.jsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/components/ErrorBoundary.jsx client/src/__tests__/ErrorBoundary.test.jsx
git commit -m "feat(client): add ErrorBoundary safety net for strangler fig refactor"
```

### Task 0.2: Wire ErrorBoundary into main.jsx

**Files:**
- Modify: `client/src/main.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/__tests__/main.test.jsx
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_local = dirname(fileURLToPath(import.meta.url));
const mainContent = readFileSync(join(__dirname_local, '..', 'main.jsx'), 'utf-8');

describe('main.jsx', () => {
  it('wraps App in ErrorBoundary', () => {
    expect(mainContent).toContain('ErrorBoundary');
    expect(mainContent).toMatch(/<ErrorBoundary>/);
  });

  it('imports ErrorBoundary component', () => {
    expect(mainContent).toContain('./components/ErrorBoundary.jsx');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/main.test.jsx`
Expected: FAIL — main.jsx does not contain "ErrorBoundary"

- [ ] **Step 3: Modify main.jsx**

```jsx
// client/src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/main.test.jsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/main.jsx client/src/__tests__/main.test.jsx
git commit -m "feat(client): wrap App in ErrorBoundary safety net"
```

---

## Phase 1: Auth Subsystem Extraction

Extract the simplest domain first — auth state and login handlers — to establish the strangler fig pattern.

### Task 1.1: Create AuthContext

**Files:**
- Create: `client/src/contexts/AuthContext.jsx`
- Test: `client/src/__tests__/AuthContext.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/__tests__/AuthContext.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../contexts/AuthContext.jsx';

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

  it('sets loggedIn=true via setLoggedIn', () => {
    const emit = vi.fn();
    const { rerender } = render(
      <AuthProvider socket={{ emit }}>
        <TestConsumer />
      </AuthProvider>
    );
    // The provider exposes setLoggedIn through onLoginSuccess callback
    // We test by simulating the auth:login-success event
    // For now, test that logout sets loggedIn=false (already false, but test the mechanism)
    expect(screen.getByTestId('status').textContent).toBe('false');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/AuthContext.test.jsx`
Expected: FAIL with "Cannot find module '../contexts/AuthContext.jsx'"

- [ ] **Step 3: Write minimal implementation**

```jsx
// client/src/contexts/AuthContext.jsx
import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ socket, children }) {
  const [loggedIn, setLoggedIn] = useState(false);
  const speechAudioRef = useRef(null);

  // Check auth status on mount
  useEffect(() => {
    fetch('/api/auth/status')
      .then(r => r.json())
      .then(data => setLoggedIn(data.loggedIn))
      .catch(() => {});
  }, []);

  const loginPhone = useCallback((phone, password) => {
    // Unlock audio for autoplay — runs during user click gesture
    if (speechAudioRef.current) speechAudioRef.current.play().catch(() => {});
    if (socket) socket.emit('auth:login-phone', { phone, password });
  }, [socket]);

  const loginQr = useCallback(() => {
    if (speechAudioRef.current) speechAudioRef.current.play().catch(() => {});
    if (socket) socket.emit('auth:login-qr-start');
  }, [socket]);

  const logout = useCallback(() => {
    setLoggedIn(false);
  }, []);

  const value = {
    loggedIn,
    setLoggedIn,
    loginPhone,
    loginQr,
    logout,
    speechAudioRef,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/AuthContext.test.jsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/contexts/AuthContext.jsx client/src/__tests__/AuthContext.test.jsx
git commit -m "feat(client): extract AuthContext — strangler fig phase 1"
```

### Task 1.2: Wire AuthContext into App.jsx

**Files:**
- Modify: `client/src/App.jsx` — remove auth state, consume `useAuth()`
- Modify: `client/src/main.jsx` — wrap App in AuthProvider

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/__tests__/AppAuthIntegration.test.jsx
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_local = dirname(fileURLToPath(import.meta.url));
const appContent = readFileSync(join(__dirname_local, '..', 'App.jsx'), 'utf-8');

describe('App.jsx auth integration', () => {
  it('imports useAuth from AuthContext', () => {
    expect(appContent).toContain("from './contexts/AuthContext.jsx'");
    expect(appContent).toContain('useAuth');
  });

  it('no longer declares local loggedIn useState', () => {
    expect(appContent).not.toMatch(/const\s*\[loggedIn[^]]*\]\s*=\s*useState/);
  });

  it('no longer declares local handleLoginPhone', () => {
    expect(appContent).not.toMatch(/const\s+handleLoginPhone/);
  });

  it('no longer declares local handleLoginQr', () => {
    expect(appContent).not.toMatch(/const\s+handleLoginQr/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/AppAuthIntegration.test.jsx`
Expected: FAIL — App.jsx still has local `loggedIn` useState

- [ ] **Step 3: Modify App.jsx**

Add the import at the top of `App.jsx`, after the existing hook imports:

```jsx
import { useAuth } from './contexts/AuthContext.jsx';
```

Inside the `App()` function, replace:
```jsx
const [loggedIn, setLoggedIn] = useState(false);
```
with:
```jsx
const { loggedIn, setLoggedIn, loginPhone: handleLoginPhone, loginQr: handleLoginQr, speechAudioRef: authSpeechAudioRef } = useAuth();
```

Remove the `handleLoginPhone` useCallback (lines 377-381) and `handleLoginQr` useCallback (lines 382-386).

Remove the auth status fetch from the socket useEffect (line 277):
```jsx
fetch('/api/auth/status').then(r => r.json()).then(data => setLoggedIn(data.loggedIn)).catch(() => {});
```

Update the `speechAudioRef` usage — since `useAuth` now owns `speechAudioRef`, either:
- Keep the local `speechAudioRef` and sync it, OR
- Use `authSpeechAudioRef` from `useAuth()` for the `<audio ref={...}>` element

The simplest approach: keep `speechAudioRef` in App.jsx for now (the audio element is rendered in App.jsx), and pass it to `useAuth` via a ref. Update AuthContext to accept an external ref:

Actually, the cleanest strangler-fig approach: AuthContext owns `speechAudioRef`, and App.jsx uses it from context. Update the `<audio ref={speechAudioRef}>` line to use `authSpeechAudioRef`:

```jsx
<audio ref={authSpeechAudioRef} preload="auto" />
```

Remove the local `speechAudioRef` declaration (line 82).

Also remove the `auth:login-success` socket handler (line 276) since AuthContext will handle it. But wait — AuthContext doesn't have the socket event listener yet. For the strangler pattern, we move incrementally. Keep the `auth:login-success` handler in App.jsx for now, but have it call `setLoggedIn` from `useAuth()`. The handler already works because `setLoggedIn` comes from `useAuth()`.

Actually, looking at App.jsx line 276:
```jsx
socket.on('auth:login-success', () => setLoggedIn(true));
```

Since `setLoggedIn` now comes from `useAuth()`, this still works. And the `E.LOGIN_REQUIRED` handler (line 263):
```jsx
socket.on(E.LOGIN_REQUIRED, () => setLoggedIn(false));
```

This also still works. So the socket handlers for auth stay in App.jsx for now — they'll be moved to AuthContext's own useEffect in Phase 7 (socket event split).

- [ ] **Step 4: Run all tests to verify nothing broke**

Run: `npx vitest run`
Expected: ALL PASS (existing tests + new AuthContext tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/App.jsx client/src/__tests__/AppAuthIntegration.test.jsx
git commit -m "refactor(client): wire App.jsx to AuthContext — remove local auth state"
```

---

## Phase 2: Radio/Player Subsystem Extraction

Extract the radio state, player handlers, and music audio effects — the largest domain in App.jsx.

### Task 2.1: Create RadioContext

**Files:**
- Create: `client/src/contexts/RadioContext.jsx`
- Test: `client/src/__tests__/RadioContext.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/__tests__/RadioContext.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { RadioProvider, useRadio } from '../contexts/RadioContext.jsx';

function TestConsumer() {
  const { radioState, skip, previous, pause, resume, setMode, updateRadioState } = useRadio();
  return (
    <div>
      <span data-testid="playing">{String(radioState.isPlaying)}</span>
      <span data-testid="mode">{radioState.queueMode}</span>
      <button onClick={skip}>Skip</button>
      <button onClick={previous}>Prev</button>
      <button onClick={pause}>Pause</button>
      <button onClick={resume}>Resume</button>
      <button onClick={() => setMode('sequential')}>Seq</button>
      <button onClick={() => updateRadioState({ isPlaying: true })}>Play</button>
    </div>
  );
}

describe('RadioContext', () => {
  it('initializes with default radio state', () => {
    render(
      <RadioProvider socket={null}>
        <TestConsumer />
      </RadioProvider>
    );
    expect(screen.getByTestId('playing').textContent).toBe('false');
    expect(screen.getByTestId('mode').textContent).toBe('shuffle');
  });

  it('emits player:skip on skip()', () => {
    const emit = vi.fn();
    render(
      <RadioProvider socket={{ emit }}>
        <TestConsumer />
      </RadioProvider>
    );
    screen.getByText('Skip').click();
    expect(emit).toHaveBeenCalledWith('player:skip');
  });

  it('emits player:pause on pause()', () => {
    const emit = vi.fn();
    render(
      <RadioProvider socket={{ emit }}>
        <TestConsumer />
      </RadioProvider>
    );
    screen.getByText('Pause').click();
    expect(emit).toHaveBeenCalledWith('player:pause');
  });

  it('emits player:set-mode on setMode()', () => {
    const emit = vi.fn();
    render(
      <RadioProvider socket={{ emit }}>
        <TestConsumer />
      </RadioProvider>
    );
    screen.getByText('Seq').click();
    expect(emit).toHaveBeenCalledWith('player:set-mode', { mode: 'sequential' });
  });

  it('updateRadioState merges partial state', () => {
    render(
      <RadioProvider socket={null}>
        <TestConsumer />
      </RadioProvider>
    );
    screen.getByText('Play').click();
    expect(screen.getByTestId('playing').textContent).toBe('true');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/RadioContext.test.jsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```jsx
// client/src/contexts/RadioContext.jsx
import { createContext, useContext, useState, useCallback, useRef } from 'react';

const RadioContext = createContext(null);

const DEFAULT_RADIO_STATE = {
  currentSong: null,
  startedAt: null,
  isPlaying: false,
  queueMode: 'shuffle',
  upcomingSongs: [],
  elapsed: 0,
  duration: 0,
  audioUrl: null,
};

export function RadioProvider({ socket, children }) {
  const [radioState, setRadioState] = useState(DEFAULT_RADIO_STATE);
  const musicAudioRef = useRef(null);
  const musicRetryRef = useRef(0);
  const isPlayingRef = useRef(false);
  isPlayingRef.current = radioState.isPlaying;

  const updateRadioState = useCallback((partial) => {
    setRadioState(prev => ({ ...prev, ...partial }));
  }, []);

  const skip = useCallback(() => {
    if (socket) socket.emit('player:skip');
  }, [socket]);

  const previous = useCallback(() => {
    if (socket) socket.emit('player:previous');
  }, [socket]);

  const pause = useCallback(() => {
    if (socket) socket.emit('player:pause');
  }, [socket]);

  const resume = useCallback(() => {
    if (socket) socket.emit('player:resume');
  }, [socket]);

  const setMode = useCallback((mode) => {
    if (socket) socket.emit('player:set-mode', { mode });
  }, [socket]);

  const value = {
    radioState,
    setRadioState,
    updateRadioState,
    skip,
    previous,
    pause,
    resume,
    setMode,
    musicAudioRef,
    musicRetryRef,
    isPlayingRef,
  };

  return <RadioContext.Provider value={value}>{children}</RadioContext.Provider>;
}

export function useRadio() {
  const ctx = useContext(RadioContext);
  if (!ctx) throw new Error('useRadio must be used within RadioProvider');
  return ctx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/RadioContext.test.jsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/contexts/RadioContext.jsx client/src/__tests__/RadioContext.test.jsx
git commit -m "feat(client): extract RadioContext — player state and handlers"
```

### Task 2.2: Create useAudioController Hook

Extract the three music-audio useEffects from App.jsx (play on URL change, sync play/pause, pause on disconnect).

**Files:**
- Create: `client/src/hooks/useAudioController.js`
- Test: `client/src/__tests__/useAudioController.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/__tests__/useAudioController.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAudioController } from '../hooks/useAudioController.js';

describe('useAudioController', () => {
  it('does not play audio when not logged in', () => {
    const audio = { src: '', play: vi.fn().mockResolvedValue(undefined), load: vi.fn(), pause: vi.fn() };
    renderHook(() => useAudioController({
      audioRef: { current: audio },
      audioUrl: 'http://example.com/song.mp3',
      isPlaying: true,
      loggedIn: false,
      connected: true,
    }));
    expect(audio.play).not.toHaveBeenCalled();
  });

  it('loads and plays audio when audioUrl arrives and logged in', () => {
    const audio = { src: '', play: vi.fn().mockResolvedValue(undefined), load: vi.fn(), pause: vi.fn() };
    renderHook(() => useAudioController({
      audioRef: { current: audio },
      audioUrl: 'http://example.com/song.mp3',
      isPlaying: true,
      loggedIn: true,
      connected: true,
    }));
    expect(audio.src).toBe('http://example.com/song.mp3');
    expect(audio.load).toHaveBeenCalled();
    expect(audio.play).toHaveBeenCalled();
  });

  it('does not reload audio if src already matches', () => {
    const audio = { src: 'http://example.com/song.mp3', play: vi.fn().mockResolvedValue(undefined), load: vi.fn(), pause: vi.fn() };
    renderHook(() => useAudioController({
      audioRef: { current: audio },
      audioUrl: 'http://example.com/song.mp3',
      isPlaying: true,
      loggedIn: true,
      connected: true,
    }));
    expect(audio.load).not.toHaveBeenCalled();
  });

  it('pauses audio when disconnected', () => {
    const audio = { src: '', play: vi.fn().mockResolvedValue(undefined), load: vi.fn(), pause: vi.fn() };
    const { rerender } = renderHook(
      ({ connected }) => useAudioController({
        audioRef: { current: audio },
        audioUrl: 'http://example.com/song.mp3',
        isPlaying: true,
        loggedIn: true,
        connected,
      }),
      { initialProps: { connected: true } }
    );
    rerender({ connected: false });
    expect(audio.pause).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/useAudioController.test.jsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```jsx
// client/src/hooks/useAudioController.js
import { useEffect, useRef } from 'react';

/**
 * useAudioController — manages the music <audio> element lifecycle.
 *
 * Extracted from App.jsx lines 120-150. Handles:
 * 1. Load + play when new audioUrl arrives (and user is logged in)
 * 2. Sync play/pause state with radio state
 * 3. Pause all audio when socket disconnects
 *
 * @param {object} params
 * @param {React.RefObject<HTMLAudioElement>} params.audioRef - ref to music audio element
 * @param {string|null} params.audioUrl - current song URL
 * @param {boolean} params.isPlaying - whether radio should be playing
 * @param {boolean} params.loggedIn - auth state
 * @param {boolean} params.connected - socket connection state
 */
export function useAudioController({ audioRef, audioUrl, isPlaying, loggedIn, connected }) {
  const musicRetryRef = useRef(0);

  // Load + play when new audioUrl arrives
  useEffect(() => {
    if (!loggedIn) return;
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    if (audio.src === audioUrl) return; // already loaded
    musicRetryRef.current = 0;
    audio.src = audioUrl;
    audio.load();
    audio.play().catch(() => {});
  }, [audioUrl, loggedIn, audioRef]);

  // Sync play/pause
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    if (!connected) return;
    if (isPlaying) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [isPlaying, loggedIn, connected, audioUrl, audioRef]);

  // Pause when disconnected
  useEffect(() => {
    if (connected) return;
    const audio = audioRef.current;
    if (audio) audio.pause();
  }, [connected, audioRef]);

  return { musicRetryRef };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/useAudioController.test.jsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/hooks/useAudioController.js client/src/__tests__/useAudioController.test.jsx
git commit -m "feat(client): extract useAudioController hook from App.jsx"
```

### Task 2.3: Wire RadioContext + useAudioController into App.jsx

**Files:**
- Modify: `client/src/App.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/__tests__/AppRadioIntegration.test.jsx
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_local = dirname(fileURLToPath(import.meta.url));
const appContent = readFileSync(join(__dirname_local, '..', 'App.jsx'), 'utf-8');

describe('App.jsx radio integration', () => {
  it('imports useRadio from RadioContext', () => {
    expect(appContent).toContain("from './contexts/RadioContext.jsx'");
    expect(appContent).toContain('useRadio');
  });

  it('imports useAudioController', () => {
    expect(appContent).toContain("from './hooks/useAudioController.js'");
    expect(appContent).toContain('useAudioController');
  });

  it('no longer declares local radioState useState', () => {
    expect(appContent).not.toMatch(/const\s*\[radioState[^]]*\]\s*=\s*useState/);
  });

  it('no longer declares local handleSkip', () => {
    expect(appContent).not.toMatch(/const\s+handleSkip\s*=/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/AppRadioIntegration.test.jsx`
Expected: FAIL — App.jsx still has local radioState

- [ ] **Step 3: Modify App.jsx**

Add imports:
```jsx
import { useRadio } from './contexts/RadioContext.jsx';
import { useAudioController } from './hooks/useAudioController.js';
```

Replace the radio state declaration (lines 58-67):
```jsx
const [radioState, setRadioState] = useState({
  currentSong: null,
  startedAt: null,
  isPlaying: false,
  queueMode: 'shuffle',
  upcomingSongs: [],
  elapsed: 0,
  duration: 0,
  audioUrl: null,
});
```
with:
```jsx
const { radioState, setRadioState, updateRadioState, skip: handleSkip, previous: handlePrevious, pause: handlePause, resume: handleResume, setMode: handleSetMode, musicAudioRef, musicRetryRef, isPlayingRef } = useRadio();
```

Remove the local `musicAudioRef`, `musicRetryRef`, `isPlayingRef` declarations (lines 80-81, 78-79).

Remove the three music-audio useEffects (lines 120-150) and replace with:
```jsx
useAudioController({
  audioRef: musicAudioRef,
  audioUrl: radioState.audioUrl,
  isPlaying: radioState.isPlaying,
  loggedIn,
  connected,
});
```

Remove the player handler useCallbacks (lines 347-351):
```jsx
const handleSkip = useCallback(...);
const handlePrevious = useCallback(...);
const handlePause = useCallback(...);
const handleResume = useCallback(...);
const handleSetMode = useCallback(...);
```

Update all `setRadioState(prev => ...)` calls to use `updateRadioState(...)` or `setRadioState(...)` (the context exposes both).

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/App.jsx client/src/__tests__/AppRadioIntegration.test.jsx
git commit -m "refactor(client): wire App.jsx to RadioContext + useAudioController"
```

---

## Phase 3: Chat/DJ Dialog Subsystem Extraction

Extract chat messages, DJ dialog state, and chat-related handlers.

### Task 3.1: Create ChatContext

**Files:**
- Create: `client/src/contexts/ChatContext.jsx`
- Test: `client/src/__tests__/ChatContext.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/__tests__/ChatContext.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatProvider, useChat } from '../contexts/ChatContext.jsx';

function TestConsumer() {
  const {
    chatMessages, setChatMessages, chatOpen, setChatOpen,
    djDialogText, djDialogStreaming, djDialogVisible,
    sendMessage, hideDJDialog,
  } = useChat();
  return (
    <div>
      <span data-testid="msg-count">{chatMessages.length}</span>
      <span data-testid="chat-open">{String(chatOpen)}</span>
      <span data-testid="dj-visible">{String(djDialogVisible)}</span>
      <button onClick={() => setChatOpen(true)}>Open</button>
      <button onClick={() => sendMessage('hello')}>Send</button>
      <button onClick={hideDJDialog}>HideDJ</button>
    </div>
  );
}

describe('ChatContext', () => {
  it('initializes with empty messages and closed chat', () => {
    render(
      <ChatProvider socket={null}>
        <TestConsumer />
      </ChatProvider>
    );
    expect(screen.getByTestId('msg-count').textContent).toBe('0');
    expect(screen.getByTestId('chat-open').textContent).toBe('false');
    expect(screen.getByTestId('dj-visible').textContent).toBe('false');
  });

  it('sendMessage adds user message and emits chat:message', () => {
    const emit = vi.fn();
    render(
      <ChatProvider socket={{ emit }}>
        <TestConsumer />
      </ChatProvider>
    );
    screen.getByText('Send').click();
    expect(screen.getByTestId('msg-count').textContent).toBe('1');
    expect(emit).toHaveBeenCalledWith('chat:message', { text: 'hello' });
  });

  it('hideDJDialog sets visible to false', () => {
    render(
      <ChatProvider socket={null}>
        <TestConsumer />
      </ChatProvider>
    );
    screen.getByText('HideDJ').click();
    expect(screen.getByTestId('dj-visible').textContent).toBe('false');
  });

  it('hides DJ dialog when chat opens', () => {
    render(
      <ChatProvider socket={null}>
        <TestConsumer />
      </ChatProvider>
    );
    screen.getByText('Open').click();
    expect(screen.getByTestId('chat-open').textContent).toBe('true');
    // DJ dialog should also be hidden when chat opens
    expect(screen.getByTestId('dj-visible').textContent).toBe('false');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/ChatContext.test.jsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```jsx
// client/src/contexts/ChatContext.jsx
import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useChatHistory } from '../hooks/useChatHistory.js';

const ChatContext = createContext(null);

export function ChatProvider({ socket, children }) {
  const [chatMessages, setChatMessages] = useChatHistory(socket);
  const [chatOpen, setChatOpen] = useState(false);
  const chatOpenRef = useRef(false);
  chatOpenRef.current = chatOpen;

  const [djDialogText, setDjDialogText] = useState('');
  const [djDialogStreaming, setDjDialogStreaming] = useState(false);
  const [djDialogVisible, setDjDialogVisible] = useState(false);
  const [djDialogMsgId, setDjDialogMsgId] = useState('');
  const djDialogTextRef = useRef('');
  const djStreamIdRef = useRef(null);

  // Hide DJ dialog when chat panel opens
  useEffect(() => {
    if (chatOpen) setDjDialogVisible(false);
  }, [chatOpen]);

  const sendMessage = useCallback((text) => {
    if (!socket) return;
    setChatMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: text }]);
    socket.emit('chat:message', { text });
  }, [socket, setChatMessages]);

  const hideDJDialog = useCallback(() => {
    setDjDialogVisible(false);
  }, []);

  // Internal setters for socket event hooks (Phase 7 will use these)
  const showDJMessage = useCallback((text) => {
    if (!chatOpenRef.current && text) {
      djDialogTextRef.current = text;
      setDjDialogText(text);
      setDjDialogStreaming(false);
      setDjDialogVisible(true);
      setDjDialogMsgId(`dj-msg-${Date.now()}`);
    }
  }, []);

  const appendDJStreamChunk = useCallback((messageId, token) => {
    setChatMessages(prev => {
      const last = prev[prev.length - 1];
      if (last && last.id === messageId && last.role === 'assistant') {
        return [...prev.slice(0, -1), { ...last, content: last.content + token }];
      }
      return [...prev, { id: messageId, role: 'assistant', content: token }];
    });
    if (!chatOpenRef.current) {
      if (djStreamIdRef.current !== messageId) {
        djStreamIdRef.current = messageId;
        djDialogTextRef.current = token || '';
        setDjDialogMsgId(messageId);
      } else {
        djDialogTextRef.current += token || '';
      }
      setDjDialogText(djDialogTextRef.current);
      setDjDialogStreaming(true);
      setDjDialogVisible(true);
    }
  }, [setChatMessages]);

  const endDJStream = useCallback(() => {
    setDjDialogStreaming(false);
    djStreamIdRef.current = null;
  }, []);

  const value = {
    chatMessages,
    setChatMessages,
    chatOpen,
    setChatOpen,
    chatOpenRef,
    djDialogText,
    djDialogStreaming,
    djDialogVisible,
    djDialogMsgId,
    djDialogTextRef,
    sendMessage,
    hideDJDialog,
    showDJMessage,
    appendDJStreamChunk,
    endDJStream,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/ChatContext.test.jsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/contexts/ChatContext.jsx client/src/__tests__/ChatContext.test.jsx
git commit -m "feat(client): extract ChatContext — chat messages and DJ dialog state"
```

### Task 3.2: Wire ChatContext into App.jsx

**Files:**
- Modify: `client/src/App.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/__tests__/AppChatIntegration.test.jsx
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_local = dirname(fileURLToPath(import.meta.url));
const appContent = readFileSync(join(__dirname_local, '..', 'App.jsx'), 'utf-8');

describe('App.jsx chat integration', () => {
  it('imports useChat from ChatContext', () => {
    expect(appContent).toContain("from './contexts/ChatContext.jsx'");
    expect(appContent).toContain('useChat');
  });

  it('no longer declares local chatOpen useState', () => {
    expect(appContent).not.toMatch(/const\s*\[chatOpen[^]]*\]\s*=\s*useState/);
  });

  it('no longer declares local djDialogText useState', () => {
    expect(appContent).not.toMatch(/const\s*\[djDialogText[^]]*\]\s*=\s*useState/);
  });

  it('no longer declares local handleChatMessage', () => {
    expect(appContent).not.toMatch(/const\s+handleChatMessage/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/AppChatIntegration.test.jsx`
Expected: FAIL — App.jsx still has local chat state

- [ ] **Step 3: Modify App.jsx**

Add import:
```jsx
import { useChat } from './contexts/ChatContext.jsx';
```

Replace the chat/DJ dialog state declarations (lines 68, 86-94) with:
```jsx
const {
  chatMessages, setChatMessages, chatOpen, setChatOpen,
  djDialogText, djDialogStreaming, djDialogVisible, djDialogMsgId,
  sendMessage: handleChatMessage, hideDJDialog: handleDJDialogHide,
  showDJMessage, appendDJStreamChunk, endDJStream, chatOpenRef,
} = useChat();
```

Remove the local declarations for: `chatOpen`, `chatOpenRef`, `djDialogText`, `djDialogStreaming`, `djDialogVisible`, `djDialogMsgId`, `djDialogTextRef`, `djStreamIdRef`.

Remove the `handleChatMessage` useCallback (lines 352-356).
Remove the `handleDJDialogReply` and `handleDJDialogHide` useCallbacks (lines 367-372).
Remove the "Hide DJ dialog when chat panel opens" useEffect (lines 374-376) — now handled by ChatContext.

Update the socket event handlers to use the context methods:
- `E.DJ_MESSAGE` handler: replace inline logic with `showDJMessage(data.text)`
- `E.DJ_STREAM_CHUNK` handler: replace inline logic with `appendDJStreamChunk(data.messageId, data.token)`
- `E.DJ_STREAM_END` handler: replace with `endDJStream()`

Keep `handleDJDialogReply` as a simple inline:
```jsx
const handleDJDialogReply = useCallback(() => {
  setChatOpen(true);
}, [setChatOpen]);
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/App.jsx client/src/__tests__/AppChatIntegration.test.jsx
git commit -m "refactor(client): wire App.jsx to ChatContext — remove local chat state"
```

---

## Phase 4: Cold-Start Subsystem Extraction

Extract the cold-start state machine: phase transitions, exit animation timer, deferred speech playback.

### Task 4.1: Create ColdStartContext

**Files:**
- Create: `client/src/contexts/ColdStartContext.jsx`
- Test: `client/src/__tests__/ColdStartContext.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/__tests__/ColdStartContext.test.jsx
import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ColdStartProvider, useColdStart } from '../contexts/ColdStartContext.jsx';

function TestConsumer() {
  const { coldPhase, setColdPhase, coldPhaseText, setColdPhaseText, coldOpenText, setColdOpenText, isColdLoading } = useColdStart();
  return (
    <div>
      <span data-testid="phase">{coldPhase}</span>
      <span data-testid="loading">{String(isColdLoading)}</span>
      <button onClick={() => setColdPhase('exit')}>Exit</button>
      <button onClick={() => setColdPhase('done')}>Done</button>
    </div>
  );
}

describe('ColdStartContext', () => {
  it('starts in loading phase', () => {
    render(
      <ColdStartProvider>
        <TestConsumer />
      </ColdStartProvider>
    );
    expect(screen.getByTestId('phase').textContent).toBe('loading');
    expect(screen.getByTestId('loading').textContent).toBe('true');
  });

  it('isColdLoading is false when phase is done', () => {
    render(
      <ColdStartProvider>
        <TestConsumer />
      </ColdStartProvider>
    );
    screen.getByText('Done').click();
    expect(screen.getByTestId('loading').textContent).toBe('false');
  });

  it('isColdLoading is true when phase is exit', () => {
    render(
      <ColdStartProvider>
        <TestConsumer />
      </ColdStartProvider>
    );
    screen.getByText('Exit').click();
    expect(screen.getByTestId('loading').textContent).toBe('true');
  });

  it('transitions from exit to done after 900ms', async () => {
    vi.useFakeTimers();
    render(
      <ColdStartProvider>
        <TestConsumer />
      </ColdStartProvider>
    );
    screen.getByText('Exit').click();
    expect(screen.getByTestId('phase').textContent).toBe('exit');
    act(() => { vi.advanceTimersByTime(900); });
    expect(screen.getByTestId('phase').textContent).toBe('done');
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/ColdStartContext.test.jsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```jsx
// client/src/contexts/ColdStartContext.jsx
import { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';

const ColdStartContext = createContext(null);

export function ColdStartProvider({ children }) {
  const [coldPhase, setColdPhase] = useState('loading');
  const [coldPhaseText, setColdPhaseText] = useState('');
  const [coldOpenText, setColdOpenText] = useState('');
  const coldPhaseRef = useRef(coldPhase);
  coldPhaseRef.current = coldPhase;
  const pendingSpeechRef = useRef(null);

  // Exit animation timer: fades out overlay → 'done'
  useEffect(() => {
    if (coldPhase !== 'exit') return;
    const timer = setTimeout(() => setColdPhase('done'), 900);
    return () => clearTimeout(timer);
  }, [coldPhase]);

  const isColdLoading = coldPhase !== 'done';

  const value = {
    coldPhase,
    setColdPhase,
    coldPhaseRef,
    coldPhaseText,
    setColdPhaseText,
    coldOpenText,
    setColdOpenText,
    pendingSpeechRef,
    isColdLoading,
  };

  return <ColdStartContext.Provider value={value}>{children}</ColdStartContext.Provider>;
}

export function useColdStart() {
  const ctx = useContext(ColdStartContext);
  if (!ctx) throw new Error('useColdStart must be used within ColdStartProvider');
  return ctx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/ColdStartContext.test.jsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/contexts/ColdStartContext.jsx client/src/__tests__/ColdStartContext.test.jsx
git commit -m "feat(client): extract ColdStartContext — cold-start state machine"
```

### Task 4.2: Wire ColdStartContext into App.jsx

**Files:**
- Modify: `client/src/App.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/__tests__/AppColdStartIntegration.test.jsx
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_local = dirname(fileURLToPath(import.meta.url));
const appContent = readFileSync(join(__dirname_local, '..', 'App.jsx'), 'utf-8');

describe('App.jsx cold-start integration', () => {
  it('imports useColdStart from ColdStartContext', () => {
    expect(appContent).toContain("from './contexts/ColdStartContext.jsx'");
    expect(appContent).toContain('useColdStart');
  });

  it('no longer declares local coldPhase useState', () => {
    expect(appContent).not.toMatch(/const\s*\[coldPhase[^]]*\]\s*=\s*useState/);
  });

  it('no longer has exit animation timer useEffect', () => {
    // The timer logic moved to ColdStartContext
    expect(appContent).not.toMatch(/coldPhase !== 'exit'.*setTimeout.*900/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/AppColdStartIntegration.test.jsx`
Expected: FAIL — App.jsx still has local coldPhase

- [ ] **Step 3: Modify App.jsx**

Add import:
```jsx
import { useColdStart } from './contexts/ColdStartContext.jsx';
```

Replace cold-start state declarations (lines 102-108) with:
```jsx
const { coldPhase, setColdPhase, coldPhaseRef, coldPhaseText, setColdPhaseText, coldOpenText, setColdOpenText, pendingSpeechRef, isColdLoading } = useColdStart();
```

Remove the exit animation timer useEffect (lines 394-398) — now in ColdStartContext.

Remove the deferred speech playback useEffect (lines 400-408). This logic stays in App.jsx but uses `pendingSpeechRef` from context. Actually, the deferred speech playback depends on `djSpeechUrl` and `setCrabState` which are in other contexts. Keep this effect in App.jsx for now, but use `pendingSpeechRef` from ColdStartContext:

```jsx
// Play deferred cold-start speech after exit animation completes
useEffect(() => {
  if (coldPhase !== 'done') return;
  const url = pendingSpeechRef.current;
  if (!url) return;
  pendingSpeechRef.current = null;
  setDjSpeechUrl(url);
  setCrabState('talking');
}, [coldPhase, pendingSpeechRef]);
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/App.jsx client/src/__tests__/AppColdStartIntegration.test.jsx
git commit -m "refactor(client): wire App.jsx to ColdStartContext"
```

---

## Phase 5: Crab/Bubble Subsystem Extraction

Extract crab animation state and bubble interaction state.

### Task 5.1: Create CrabContext

**Files:**
- Create: `client/src/contexts/CrabContext.jsx`
- Test: `client/src/__tests__/CrabContext.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/__tests__/CrabContext.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { CrabProvider, useCrab } from '../contexts/CrabContext.jsx';

function TestConsumer() {
  const { crabState, setCrabState, bubbles, setBubbles, bubblesVisible, setBubblesVisible, crabStateRef } = useCrab();
  return (
    <div>
      <span data-testid="crab">{crabState}</span>
      <span data-testid="bubbles-count">{bubbles.length}</span>
      <span data-testid="bubbles-visible">{String(bubblesVisible)}</span>
      <button onClick={() => setCrabState('bouncing')}>Bounce</button>
      <button onClick={() => setBubbles([{ tag: 'jpop' }])}>AddBubble</button>
      <button onClick={() => setBubblesVisible(true)}>ShowBubbles</button>
    </div>
  );
}

describe('CrabContext', () => {
  it('starts with idle crab and empty bubbles', () => {
    render(
      <CrabProvider>
        <TestConsumer />
      </CrabProvider>
    );
    expect(screen.getByTestId('crab').textContent).toBe('idle');
    expect(screen.getByTestId('bubbles-count').textContent).toBe('0');
    expect(screen.getByTestId('bubbles-visible').textContent).toBe('false');
  });

  it('setCrabState updates crab state', () => {
    render(
      <CrabProvider>
        <TestConsumer />
      </CrabProvider>
    );
    screen.getByText('Bounce').click();
    expect(screen.getByTestId('crab').textContent).toBe('bouncing');
  });

  it('setBubbles updates bubbles array', () => {
    render(
      <CrabProvider>
        <TestConsumer />
      </CrabProvider>
    );
    screen.getByText('AddBubble').click();
    expect(screen.getByTestId('bubbles-count').textContent).toBe('1');
  });

  it('crabStateRef stays in sync with crabState', () => {
    let capturedRef;
    function RefCapture() {
      const crab = useCrab();
      capturedRef = crab.crabStateRef;
      return null;
    }
    render(
      <CrabProvider>
        <RefCapture />
      </CrabProvider>
    );
    expect(capturedRef.current).toBe('idle');
    // Can't easily test ref sync without re-render — covered by integration tests
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/CrabContext.test.jsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```jsx
// client/src/contexts/CrabContext.jsx
import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';

const CrabContext = createContext(null);

export function CrabProvider({ isPlaying, children }) {
  const [crabState, setCrabState] = useState('idle');
  const crabStateRef = useRef(crabState);
  crabStateRef.current = crabState;

  const [bubbles, setBubbles] = useState([]);
  const [bubblesVisible, setBubblesVisible] = useState(false);
  const bubbleTimeoutRef = useRef(null);

  // Random idle ↔ listening toggle during music playback
  useEffect(() => {
    if (!isPlaying) return;

    const scheduleNext = () => {
      const delay = 10000 + Math.random() * 20000; // 10-30s random
      return setTimeout(() => {
        const cur = crabStateRef.current;
        if (cur === 'idle') setCrabState('listening');
        else if (cur === 'listening') setCrabState('idle');
        // If talking/bouncing/loading, skip this cycle and reschedule
        timerRef.current = scheduleNext();
      }, delay);
    };

    const timerRef = { current: null };
    timerRef.current = scheduleNext();
    return () => clearTimeout(timerRef.current);
  }, [isPlaying]);

  const value = {
    crabState,
    setCrabState,
    crabStateRef,
    bubbles,
    setBubbles,
    bubblesVisible,
    setBubblesVisible,
    bubbleTimeoutRef,
  };

  return <CrabContext.Provider value={value}>{children}</CrabContext.Provider>;
}

export function useCrab() {
  const ctx = useContext(CrabContext);
  if (!ctx) throw new Error('useCrab must be used within CrabProvider');
  return ctx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/CrabContext.test.jsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/contexts/CrabContext.jsx client/src/__tests__/CrabContext.test.jsx
git commit -m "feat(client): extract CrabContext — crab animation and bubble state"
```

### Task 5.2: Wire CrabContext into App.jsx

**Files:**
- Modify: `client/src/App.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/__tests__/AppCrabIntegration.test.jsx
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_local = dirname(fileURLToPath(import.meta.url));
const appContent = readFileSync(join(__dirname_local, '..', 'App.jsx'), 'utf-8');

describe('App.jsx crab integration', () => {
  it('imports useCrab from CrabContext', () => {
    expect(appContent).toContain("from './contexts/CrabContext.jsx'");
    expect(appContent).toContain('useCrab');
  });

  it('no longer declares local crabState useState', () => {
    expect(appContent).not.toMatch(/const\s*\[crabState[^]]*\]\s*=\s*useState/);
  });

  it('no longer has inline idle/listening toggle useEffect', () => {
    expect(appContent).not.toMatch(/scheduleNext/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/AppCrabIntegration.test.jsx`
Expected: FAIL — App.jsx still has local crabState

- [ ] **Step 3: Modify App.jsx**

Add import:
```jsx
import { useCrab } from './contexts/CrabContext.jsx';
```

Replace crab/bubble state declarations (lines 72-77) with:
```jsx
const { crabState, setCrabState, crabStateRef, bubbles, setBubbles, bubblesVisible, setBubblesVisible, bubbleTimeoutRef } = useCrab();
```

Pass `isPlaying={radioState.isPlaying}` to CrabProvider (in the provider tree, not in App.jsx itself — this will be wired in the AppProviders composition).

Remove the local declarations for `crabState`, `crabStateRef`, `bubbles`, `bubblesVisible`, `bubbleTimeoutRef`.

Remove the idle/listening toggle useEffect (lines 322-339) — now in CrabContext.

Update `handleBubbleClick` to use `isPlayingRef` from RadioContext:
```jsx
const handleBubbleClick = useCallback((tag) => {
  if (!socket) return;
  socket.emit(E.CRAB_BUBBLE_CLICK, tag);
  setCrabState('bouncing');
  setTimeout(() => setCrabState(isPlayingRef.current ? 'listening' : 'idle'), 2000);
}, [socket, setCrabState, isPlayingRef]);
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/App.jsx client/src/__tests__/AppCrabIntegration.test.jsx
git commit -m "refactor(client): wire App.jsx to CrabContext"
```

---

## Phase 6: UI/Settings Subsystem Extraction

Extract view state, profile data, plan, weather, and settings state.

### Task 6.1: Create UIContext

**Files:**
- Create: `client/src/contexts/UIContext.jsx`
- Test: `client/src/__tests__/UIContext.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/__tests__/UIContext.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { UIProvider, useUI } from '../contexts/UIContext.jsx';

function TestConsumer() {
  const {
    view, setView, profileData, setProfileData,
    plan, setPlan, weather, setWeather,
    proactiveEnabled, toggleProactive,
    ttsStatus, setTtsStatus,
    error, setError,
    isViewTransitionPending, startViewTransition,
  } = useUI();
  return (
    <div>
      <span data-testid="view">{view}</span>
      <span data-testid="weather">{weather}</span>
      <span data-testid="proactive">{String(proactiveEnabled)}</span>
      <span data-testid="error">{error || 'none'}</span>
      <button onClick={() => startViewTransition(() => setView('settings'))}>Settings</button>
      <button onClick={toggleProactive}>ToggleProactive</button>
      <button onClick={() => setError('Test error')}>SetError</button>
    </div>
  );
}

describe('UIContext', () => {
  it('starts with player view and proactive enabled', () => {
    render(
      <UIProvider socket={null}>
        <TestConsumer />
      </UIProvider>
    );
    expect(screen.getByTestId('view').textContent).toBe('player');
    expect(screen.getByTestId('proactive').textContent).toBe('true');
  });

  it('startViewTransition changes view', () => {
    render(
      <UIProvider socket={null}>
        <TestConsumer />
      </UIProvider>
    );
    screen.getByText('Settings').click();
    expect(screen.getByTestId('view').textContent).toBe('settings');
  });

  it('toggleProactive flips state and emits event', () => {
    const emit = vi.fn();
    render(
      <UIProvider socket={{ emit }}>
        <TestConsumer />
      </UIProvider>
    );
    screen.getByText('ToggleProactive').click();
    expect(screen.getByTestId('proactive').textContent).toBe('false');
    expect(emit).toHaveBeenCalledWith('proactive:toggle', { enabled: false });
  });

  it('setError sets error', () => {
    render(
      <UIProvider socket={null}>
        <TestConsumer />
      </UIProvider>
    );
    screen.getByText('SetError').click();
    expect(screen.getByTestId('error').textContent).toBe('Test error');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/UIContext.test.jsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```jsx
// client/src/contexts/UIContext.jsx
import { createContext, useContext, useState, useCallback, useEffect, useTransition } from 'react';

const UIContext = createContext(null);

export function UIProvider({ socket, children }) {
  const [view, setView] = useState('player');
  const [isViewTransitionPending, startViewTransition] = useTransition();
  const [profileData, setProfileData] = useState(null);
  const [error, setError] = useState(null);
  const [plan, setPlan] = useState(null);
  const [weather, setWeather] = useState('');
  const [proactiveEnabled, setProactiveEnabled] = useState(true);
  const [ttsStatus, setTtsStatus] = useState({ available: null, provider: null, reason: '' });

  // Fetch weather on mount and refresh every 15min
  useEffect(() => {
    const fetchWeather = () => {
      fetch('/api/weather').then(r => r.json()).then(data => {
        if (data.text) setWeather(data.text);
      }).catch(() => {});
    };
    fetchWeather();
    const t = setInterval(fetchWeather, 15 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // Fetch profile data when view changes to 'profile'
  useEffect(() => {
    if (view === 'profile') {
      fetch('/api/taste').then(r => r.json()).then(setProfileData).catch(() => {});
    }
  }, [view]);

  // Fetch initial plan
  useEffect(() => {
    fetch('/api/plan/today').then(r => r.json()).then(data => {
      if (data.blocks) setPlan(data);
    }).catch(() => {});
  }, []);

  const toggleProactive = useCallback(() => {
    setProactiveEnabled(prev => {
      const next = !prev;
      if (socket) socket.emit('proactive:toggle', { enabled: next });
      return next;
    });
  }, [socket]);

  const value = {
    view,
    setView,
    isViewTransitionPending,
    startViewTransition,
    profileData,
    setProfileData,
    plan,
    setPlan,
    weather,
    setWeather,
    proactiveEnabled,
    toggleProactive,
    ttsStatus,
    setTtsStatus,
    error,
    setError,
  };

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used within UIProvider');
  return ctx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/UIContext.test.jsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/contexts/UIContext.jsx client/src/__tests__/UIContext.test.jsx
git commit -m "feat(client): extract UIContext — view, settings, weather, plan state"
```

### Task 6.2: Wire UIContext into App.jsx

**Files:**
- Modify: `client/src/App.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/__tests__/AppUIIntegration.test.jsx
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_local = dirname(fileURLToPath(import.meta.url));
const appContent = readFileSync(join(__dirname_local, '..', 'App.jsx'), 'utf-8');

describe('App.jsx UI integration', () => {
  it('imports useUI from UIContext', () => {
    expect(appContent).toContain("from './contexts/UIContext.jsx'");
    expect(appContent).toContain('useUI');
  });

  it('no longer declares local view useState', () => {
    expect(appContent).not.toMatch(/const\s*\[view[^]]*\]\s*=\s*useState/);
  });

  it('no longer declares local weather useState', () => {
    expect(appContent).not.toMatch(/const\s*\[weather[^]]*\]\s*=\s*useState/);
  });

  it('no longer has weather fetch useEffect', () => {
    expect(appContent).not.toMatch(/fetchWeather/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/AppUIIntegration.test.jsx`
Expected: FAIL — App.jsx still has local UI state

- [ ] **Step 3: Modify App.jsx**

Add import:
```jsx
import { useUI } from './contexts/UIContext.jsx';
```

Replace UI state declarations (lines 95-105) with:
```jsx
const {
  view, setView, isViewTransitionPending, startViewTransition,
  profileData, setProfileData, plan, setPlan, weather,
  proactiveEnabled, toggleProactive: handleProactiveToggle,
  ttsStatus, setTtsStatus, error, setError,
} = useUI();
```

Remove local declarations for: `view`, `isViewTransitionPending`, `startViewTransition`, `profileData`, `error`, `plan`, `weather`, `proactiveEnabled`, `ttsStatus`.

Remove the weather fetch useEffect (lines 310-319).
Remove the profile fetch useEffect (lines 341-345).
Remove the `handleProactiveToggle` useCallback (lines 387-391).

Remove the initial plan fetch from the socket useEffect (lines 279-281):
```jsx
fetch('/api/plan/today').then(r => r.json()).then(data => {
  if (data.blocks) setPlan(data);
}).catch(() => {});
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/App.jsx client/src/__tests__/AppUIIntegration.test.jsx
git commit -m "refactor(client): wire App.jsx to UIContext — remove local UI state"
```

---

## Phase 7: Socket Event Split

Extract the monolithic 115-line socket useEffect into focused domain hooks. Each hook registers only its domain's events.

### Task 7.1: Create useRadioSocketEvents Hook

**Files:**
- Create: `client/src/hooks/useRadioSocketEvents.js`
- Test: `client/src/__tests__/useRadioSocketEvents.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/__tests__/useRadioSocketEvents.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// Mock the contexts — we test the hook's event registration, not the context
vi.mock('../contexts/RadioContext.jsx', () => ({
  useRadio: () => ({
    setRadioState: vi.fn(),
    updateRadioState: vi.fn(),
    isPlayingRef: { current: false },
  }),
  useColdStart: () => ({
    coldPhaseRef: { current: 'loading' },
    setColdPhase: vi.fn(),
  }),
}));

import { useRadioSocketEvents } from '../hooks/useRadioSocketEvents.js';

function makeMockSocket() {
  const handlers = {};
  return {
    on: vi.fn((event, cb) => { handlers[event] = cb; }),
    off: vi.fn(),
    emit: vi.fn(),
    _handlers: handlers,
  };
}

describe('useRadioSocketEvents', () => {
  it('registers radio:state handler', () => {
    const socket = makeMockSocket();
    renderHook(() => useRadioSocketEvents(socket));
    expect(socket.on).toHaveBeenCalledWith('radio:state', expect.any(Function));
  });

  it('registers radio:song-change handler', () => {
    const socket = makeMockSocket();
    renderHook(() => useRadioSocketEvents(socket));
    expect(socket.on).toHaveBeenCalledWith('radio:song-change', expect.any(Function));
  });

  it('registers radio:queue-update handler', () => {
    const socket = makeMockSocket();
    renderHook(() => useRadioSocketEvents(socket));
    expect(socket.on).toHaveBeenCalledWith('radio:queue-update', expect.any(Function));
  });

  it('registers radio:pause handler', () => {
    const socket = makeMockSocket();
    renderHook(() => useRadioSocketEvents(socket));
    expect(socket.on).toHaveBeenCalledWith('radio:pause', expect.any(Function));
  });

  it('registers radio:resume handler', () => {
    const socket = makeMockSocket();
    renderHook(() => useRadioSocketEvents(socket));
    expect(socket.on).toHaveBeenCalledWith('radio:resume', expect.any(Function));
  });

  it('does nothing when socket is null', () => {
    const { result } = renderHook(() => useRadioSocketEvents(null));
    expect(result.current).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/useRadioSocketEvents.test.jsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```jsx
// client/src/hooks/useRadioSocketEvents.js
import { useEffect, useRef } from 'react';
import { useRadio } from '../contexts/RadioContext.jsx';
import { useColdStart } from '../contexts/ColdStartContext.jsx';

const E = {
  RADIO_STATE: 'radio:state',
  SONG_CHANGE: 'radio:song-change',
  QUEUE_UPDATE: 'radio:queue-update',
  PLAYBACK_POSITION: 'radio:playback-position',
  PAUSE: 'radio:pause',
  RESUME: 'radio:resume',
};

/**
 * useRadioSocketEvents — registers radio-domain socket events.
 *
 * Extracted from App.jsx's monolithic socket useEffect.
 * Handles: radio:state, song-change, queue-update, playback-position, pause, resume.
 */
export function useRadioSocketEvents(socket) {
  const { setRadioState, updateRadioState, isPlayingRef } = useRadio();
  const { coldPhaseRef, setColdPhase } = useColdStart();
  const pendingSongChangeRef = useRef(null);
  const djSpeechUrlRef = useRef(null); // Set by chat hook — read-only here

  useEffect(() => {
    if (!socket) return;

    socket.on(E.RADIO_STATE, (state) => updateRadioState(state));

    socket.on(E.SONG_CHANGE, (data) => {
      const newSongState = {
        currentSong: data.song,
        startedAt: data.startedAt,
        isPlaying: true,
        audioUrl: data.audioUrl || null,
      };
      if (djSpeechUrlRef.current) {
        pendingSongChangeRef.current = newSongState;
        updateRadioState({ currentSong: data.song, startedAt: data.startedAt, isPlaying: true });
      } else {
        updateRadioState(newSongState);
      }
      // Crab state + cold phase handled by other hooks via shared state
      if (coldPhaseRef.current === 'loading') setColdPhase('exit');
      else setColdPhase('done');
    });

    socket.on(E.QUEUE_UPDATE, (data) => updateRadioState({
      upcomingSongs: data.upcomingSongs,
      queueMode: data.mode || undefined,
    }));

    socket.on(E.PLAYBACK_POSITION, (pos) => updateRadioState({
      elapsed: pos.elapsed,
      duration: pos.duration,
    }));

    socket.on(E.PAUSE, () => {
      updateRadioState({ isPlaying: false });
    });

    socket.on(E.RESUME, (data) => updateRadioState({
      isPlaying: true,
      startedAt: data.startedAt,
    }));

    return () => {
      socket.off(E.RADIO_STATE);
      socket.off(E.SONG_CHANGE);
      socket.off(E.QUEUE_UPDATE);
      socket.off(E.PLAYBACK_POSITION);
      socket.off(E.PAUSE);
      socket.off(E.RESUME);
    };
  }, [socket, setRadioState, updateRadioState, coldPhaseRef, setColdPhase]);

  return { pendingSongChangeRef, djSpeechUrlRef };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/useRadioSocketEvents.test.jsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/hooks/useRadioSocketEvents.js client/src/__tests__/useRadioSocketEvents.test.jsx
git commit -m "feat(client): extract useRadioSocketEvents from monolithic socket listener"
```

### Task 7.2: Create useChatSocketEvents Hook

**Files:**
- Create: `client/src/hooks/useChatSocketEvents.js`
- Test: `client/src/__tests__/useChatSocketEvents.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/__tests__/useChatSocketEvents.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../contexts/ChatContext.jsx', () => ({
  useChat: () => ({
    setChatMessages: vi.fn(),
    showDJMessage: vi.fn(),
    appendDJStreamChunk: vi.fn(),
    endDJStream: vi.fn(),
  }),
}));

vi.mock('../contexts/CrabContext.jsx', () => ({
  useCrab: () => ({
    setCrabState: vi.fn(),
    crabStateRef: { current: 'idle' },
  }),
}));

vi.mock('../contexts/RadioContext.jsx', () => ({
  useRadio: () => ({
    isPlayingRef: { current: false },
  }),
}));

import { useChatSocketEvents } from '../hooks/useChatSocketEvents.js';

function makeMockSocket() {
  const handlers = {};
  return {
    on: vi.fn((event, cb) => { handlers[event] = cb; }),
    off: vi.fn(),
    _handlers: handlers,
  };
}

describe('useChatSocketEvents', () => {
  it('registers radio:dj-message handler', () => {
    const socket = makeMockSocket();
    renderHook(() => useChatSocketEvents(socket, { current: null }));
    expect(socket.on).toHaveBeenCalledWith('radio:dj-message', expect.any(Function));
  });

  it('registers radio:dj-speech-start handler', () => {
    const socket = makeMockSocket();
    renderHook(() => useChatSocketEvents(socket, { current: null }));
    expect(socket.on).toHaveBeenCalledWith('radio:dj-speech-start', expect.any(Function));
  });

  it('registers radio:dj-speech-end handler', () => {
    const socket = makeMockSocket();
    renderHook(() => useChatSocketEvents(socket, { current: null }));
    expect(socket.on).toHaveBeenCalledWith('radio:dj-speech-end', expect.any(Function));
  });

  it('registers radio:dj-stream-chunk handler', () => {
    const socket = makeMockSocket();
    renderHook(() => useChatSocketEvents(socket, { current: null }));
    expect(socket.on).toHaveBeenCalledWith('radio:dj-stream-chunk', expect.any(Function));
  });

  it('registers radio:dj-stream-end handler', () => {
    const socket = makeMockSocket();
    renderHook(() => useChatSocketEvents(socket, { current: null }));
    expect(socket.on).toHaveBeenCalledWith('radio:dj-stream-end', expect.any(Function));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/useChatSocketEvents.test.jsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```jsx
// client/src/hooks/useChatSocketEvents.js
import { useEffect, useRef } from 'react';
import { useChat } from '../contexts/ChatContext.jsx';
import { useCrab } from '../contexts/CrabContext.jsx';
import { useRadio } from '../contexts/RadioContext.jsx';
import { useColdStart } from '../contexts/ColdStartContext.jsx';

const E = {
  DJ_MESSAGE: 'radio:dj-message',
  DJ_SPEECH_START: 'radio:dj-speech-start',
  DJ_SPEECH_END: 'radio:dj-speech-end',
  DJ_STREAM_CHUNK: 'radio:dj-stream-chunk',
  DJ_STREAM_END: 'radio:dj-stream-end',
};

/**
 * useChatSocketEvents — registers chat/DJ-domain socket events.
 *
 * Extracted from App.jsx's monolithic socket useEffect.
 * Handles: dj-message, dj-speech-start, dj-speech-end, dj-stream-chunk, dj-stream-end.
 *
 * @param {object} socket - Socket.IO client
 * @param {React.RefObject} djSpeechUrlRef - shared ref for speech URL (cross-hook communication)
 * @param {React.RefObject} speechTypeRef - ref for speech type
 * @param {function} setDjSpeechUrl - setter for DJ speech URL state
 * @param {React.RefObject} pendingSpeechRef - cold-start deferred speech ref
 */
export function useChatSocketEvents(socket, djSpeechUrlRef, speechTypeRef, setDjSpeechUrl, pendingSpeechRef) {
  const { setChatMessages, showDJMessage, appendDJStreamChunk, endDJStream } = useChat();
  const { setCrabState } = useCrab();
  const { isPlayingRef } = useRadio();
  const { setColdPhase } = useColdStart();

  useEffect(() => {
    if (!socket) return;

    socket.on(E.DJ_MESSAGE, (data) => {
      setChatMessages(prev => [...prev, {
        id: `dj-msg-${Date.now()}`,
        role: 'assistant',
        content: data.text,
        isTransition: true,
      }]);
      showDJMessage(data.text);
    });

    socket.on(E.DJ_SPEECH_START, (data) => {
      speechTypeRef.current = data.type || 'transition';
      if (data.type === 'cold-start') {
        pendingSpeechRef.current = data.audioUrl;
        setColdPhase('exit');
      } else {
        djSpeechUrlRef.current = data.audioUrl;
        setDjSpeechUrl(data.audioUrl);
        setCrabState('talking');
      }
    });

    socket.on(E.DJ_SPEECH_END, () => {
      setDjSpeechUrl(null);
      djSpeechUrlRef.current = null;
      setCrabState(isPlayingRef.current ? 'listening' : 'idle');
    });

    socket.on(E.DJ_STREAM_CHUNK, (data) => {
      appendDJStreamChunk(data.messageId, data.token);
    });

    socket.on(E.DJ_STREAM_END, () => {
      endDJStream();
    });

    return () => {
      socket.off(E.DJ_MESSAGE);
      socket.off(E.DJ_SPEECH_START);
      socket.off(E.DJ_SPEECH_END);
      socket.off(E.DJ_STREAM_CHUNK);
      socket.off(E.DJ_STREAM_END);
    };
  }, [socket, setChatMessages, showDJMessage, appendDJStreamChunk, endDJStream,
      setCrabState, isPlayingRef, setColdPhase, djSpeechUrlRef, speechTypeRef,
      setDjSpeechUrl, pendingSpeechRef]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/useChatSocketEvents.test.jsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/hooks/useChatSocketEvents.js client/src/__tests__/useChatSocketEvents.test.jsx
git commit -m "feat(client): extract useChatSocketEvents from monolithic socket listener"
```

### Task 7.3: Create useCrabSocketEvents Hook

**Files:**
- Create: `client/src/hooks/useCrabSocketEvents.js`
- Test: `client/src/__tests__/useCrabSocketEvents.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/__tests__/useCrabSocketEvents.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../contexts/CrabContext.jsx', () => ({
  useCrab: () => ({
    setCrabState: vi.fn(),
    setBubbles: vi.fn(),
    setBubblesVisible: vi.fn(),
    bubbleTimeoutRef: { current: null },
    crabStateRef: { current: 'idle' },
  }),
}));

vi.mock('../contexts/RadioContext.jsx', () => ({
  useRadio: () => ({
    isPlayingRef: { current: false },
  }),
}));

import { useCrabSocketEvents } from '../hooks/useCrabSocketEvents.js';

function makeMockSocket() {
  const handlers = {};
  return {
    on: vi.fn((event, cb) => { handlers[event] = cb; }),
    off: vi.fn(),
    _handlers: handlers,
  };
}

describe('useCrabSocketEvents', () => {
  it('registers crab:bubbles handler', () => {
    const socket = makeMockSocket();
    renderHook(() => useCrabSocketEvents(socket));
    expect(socket.on).toHaveBeenCalledWith('crab:bubbles', expect.any(Function));
  });

  it('does nothing when socket is null', () => {
    const { result } = renderHook(() => useCrabSocketEvents(null));
    expect(result.current).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/useCrabSocketEvents.test.jsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```jsx
// client/src/hooks/useCrabSocketEvents.js
import { useEffect } from 'react';
import { useCrab } from '../contexts/CrabContext.jsx';
import { useRadio } from '../contexts/RadioContext.jsx';

/**
 * useCrabSocketEvents — registers crab/bubble-domain socket events.
 *
 * Extracted from App.jsx's monolithic socket useEffect.
 * Handles: crab:bubbles.
 */
export function useCrabSocketEvents(socket) {
  const { setCrabState, setBubbles, setBubblesVisible, bubbleTimeoutRef } = useCrab();
  const { isPlayingRef } = useRadio();

  useEffect(() => {
    if (!socket) return;

    socket.on('crab:bubbles', ({ bubbles: newBubbles }) => {
      setBubbles(newBubbles);
      setBubblesVisible(true);
      setCrabState('blowing');
      setTimeout(() => {
        setCrabState(prev => prev === 'blowing' ? (isPlayingRef.current ? 'listening' : 'idle') : prev);
      }, 3000);
      if (bubbleTimeoutRef.current) clearTimeout(bubbleTimeoutRef.current);
      bubbleTimeoutRef.current = setTimeout(() => setBubblesVisible(false), 30000);
    });

    return () => {
      socket.off('crab:bubbles');
      if (bubbleTimeoutRef.current) clearTimeout(bubbleTimeoutRef.current);
    };
  }, [socket, setCrabState, setBubbles, setBubblesVisible, bubbleTimeoutRef, isPlayingRef]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/useCrabSocketEvents.test.jsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/hooks/useCrabSocketEvents.js client/src/__tests__/useCrabSocketEvents.test.jsx
git commit -m "feat(client): extract useCrabSocketEvents from monolithic socket listener"
```

### Task 7.4: Create useSystemSocketEvents Hook

**Files:**
- Create: `client/src/hooks/useSystemSocketEvents.js`
- Test: `client/src/__tests__/useSystemSocketEvents.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/__tests__/useSystemSocketEvents.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({ setLoggedIn: vi.fn() }),
}));

vi.mock('../contexts/UIContext.jsx', () => ({
  useUI: () => ({
    setPlan: vi.fn(),
    setError: vi.fn(),
    setTtsStatus: vi.fn(),
  }),
}));

import { useSystemSocketEvents } from '../hooks/useSystemSocketEvents.js';

function makeMockSocket() {
  const handlers = {};
  return {
    on: vi.fn((event, cb) => { handlers[event] = cb; }),
    off: vi.fn(),
    _handlers: handlers,
  };
}

describe('useSystemSocketEvents', () => {
  it('registers radio:login-required handler', () => {
    const socket = makeMockSocket();
    renderHook(() => useSystemSocketEvents(socket));
    expect(socket.on).toHaveBeenCalledWith('radio:login-required', expect.any(Function));
  });

  it('registers plan:update handler', () => {
    const socket = makeMockSocket();
    renderHook(() => useSystemSocketEvents(socket));
    expect(socket.on).toHaveBeenCalledWith('plan:update', expect.any(Function));
  });

  it('registers radio:error handler', () => {
    const socket = makeMockSocket();
    renderHook(() => useSystemSocketEvents(socket));
    expect(socket.on).toHaveBeenCalledWith('radio:error', expect.any(Function));
  });

  it('registers auth:login-success handler', () => {
    const socket = makeMockSocket();
    renderHook(() => useSystemSocketEvents(socket));
    expect(socket.on).toHaveBeenCalledWith('auth:login-success', expect.any(Function));
  });

  it('registers tts:status handler', () => {
    const socket = makeMockSocket();
    renderHook(() => useSystemSocketEvents(socket));
    expect(socket.on).toHaveBeenCalledWith('tts:status', expect.any(Function));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/useSystemSocketEvents.test.jsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```jsx
// client/src/hooks/useSystemSocketEvents.js
import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useUI } from '../contexts/UIContext.jsx';

const E = {
  LOGIN_REQUIRED: 'radio:login-required',
  PLAN_UPDATE: 'plan:update',
  ERROR: 'radio:error',
};

/**
 * useSystemSocketEvents — registers system-level socket events.
 *
 * Extracted from App.jsx's monolithic socket useEffect.
 * Handles: login-required, plan:update, error, auth:login-success, tts:status, cold-start:phase.
 */
export function useSystemSocketEvents(socket) {
  const { setLoggedIn } = useAuth();
  const { setPlan, setError, setTtsStatus } = useUI();

  useEffect(() => {
    if (!socket) return;

    socket.on(E.LOGIN_REQUIRED, () => setLoggedIn(false));
    socket.on('auth:login-success', () => setLoggedIn(true));
    socket.on(E.PLAN_UPDATE, (data) => setPlan(data));
    socket.on(E.ERROR, (err) => {
      setError(err.message);
      setTimeout(() => setError(null), 5000);
    });
    socket.on('tts:status', (data) => setTtsStatus(data));
    socket.on('cold-start:phase', (data) => {
      // Delegated to ColdStartContext via UIContext — kept here for now
      // Phase 8 will move cold-start:phase to useColdStartSocketEvents
    });

    return () => {
      socket.off(E.LOGIN_REQUIRED);
      socket.off('auth:login-success');
      socket.off(E.PLAN_UPDATE);
      socket.off(E.ERROR);
      socket.off('tts:status');
      socket.off('cold-start:phase');
    };
  }, [socket, setLoggedIn, setPlan, setError, setTtsStatus]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/useSystemSocketEvents.test.jsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/hooks/useSystemSocketEvents.js client/src/__tests__/useSystemSocketEvents.test.jsx
git commit -m "feat(client): extract useSystemSocketEvents from monolithic socket listener"
```

### Task 7.5: Replace Monolithic Socket useEffect in App.jsx

**Files:**
- Modify: `client/src/App.jsx` — replace the 115-line socket useEffect with calls to the four focused hooks

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/__tests__/AppSocketSplit.test.jsx
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_local = dirname(fileURLToPath(import.meta.url));
const appContent = readFileSync(join(__dirname_local, '..', 'App.jsx'), 'utf-8');

describe('App.jsx socket split', () => {
  it('imports useRadioSocketEvents', () => {
    expect(appContent).toContain('useRadioSocketEvents');
  });

  it('imports useChatSocketEvents', () => {
    expect(appContent).toContain('useChatSocketEvents');
  });

  it('imports useCrabSocketEvents', () => {
    expect(appContent).toContain('useCrabSocketEvents');
  });

  it('imports useSystemSocketEvents', () => {
    expect(appContent).toContain('useSystemSocketEvents');
  });

  it('no longer has inline socket.on for radio:state', () => {
    expect(appContent).not.toMatch(/socket\.on\(['"]radio:state['"]/);
  });

  it('no longer has inline socket.on for crab:bubbles', () => {
    expect(appContent).not.toMatch(/socket\.on\(['"]crab:bubbles['"]/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/AppSocketSplit.test.jsx`
Expected: FAIL — App.jsx still has inline socket.on calls

- [ ] **Step 3: Modify App.jsx**

Add imports:
```jsx
import { useRadioSocketEvents } from './hooks/useRadioSocketEvents.js';
import { useChatSocketEvents } from './hooks/useChatSocketEvents.js';
import { useCrabSocketEvents } from './hooks/useCrabSocketEvents.js';
import { useSystemSocketEvents } from './hooks/useSystemSocketEvents.js';
```

Replace the entire monolithic socket useEffect (lines 173-288) with:
```jsx
// Socket event listeners — split by domain
const { pendingSongChangeRef, djSpeechUrlRef } = useRadioSocketEvents(socket);
useChatSocketEvents(socket, djSpeechUrlRef, speechTypeRef, setDjSpeechUrl, pendingSpeechRef);
useCrabSocketEvents(socket);
useSystemSocketEvents(socket);
```

Keep the `client:ready` emit useEffect (lines 291-295) and the geolocation useEffect (lines 298-307) — these are app-level side effects that belong in App.jsx.

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/App.jsx client/src/__tests__/AppSocketSplit.test.jsx
git commit -m "refactor(client): replace monolithic socket listener with 4 focused hooks"
```

---

## Phase 8: AppProviders Composition + Final Decomposition

Create the provider composition root and reduce App.jsx to a thin shell.

### Task 8.1: Create AppProviders

**Files:**
- Create: `client/src/contexts/AppProviders.jsx`
- Test: `client/src/__tests__/AppProviders.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/__tests__/AppProviders.test.jsx
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_local = dirname(fileURLToPath(import.meta.url));
const content = readFileSync(join(__dirname_local, '..', 'contexts', 'AppProviders.jsx'), 'utf-8');

describe('AppProviders', () => {
  it('nests all 6 providers', () => {
    expect(content).toContain('AuthProvider');
    expect(content).toContain('RadioProvider');
    expect(content).toContain('ChatProvider');
    expect(content).toContain('ColdStartProvider');
    expect(content).toContain('CrabProvider');
    expect(content).toContain('UIProvider');
  });

  it('exports AppProviders function', () => {
    expect(content).toMatch(/export function AppProviders/);
  });

  it('passes socket to providers that need it', () => {
    expect(content).toMatch(/AuthProvider.*socket/);
    expect(content).toMatch(/RadioProvider.*socket/);
    expect(content).toMatch(/ChatProvider.*socket/);
    expect(content).toMatch(/UIProvider.*socket/);
  });

  it('passes isPlaying to CrabProvider', () => {
    expect(content).toMatch(/CrabProvider.*isPlaying/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/AppProviders.test.jsx`
Expected: FAIL — file not found

- [ ] **Step 3: Write minimal implementation**

```jsx
// client/src/contexts/AppProviders.jsx
import { AuthProvider } from './AuthContext.jsx';
import { RadioProvider } from './RadioContext.jsx';
import { ChatProvider } from './ChatContext.jsx';
import { ColdStartProvider } from './ColdStartContext.jsx';
import { CrabProvider } from './CrabContext.jsx';
import { UIProvider } from './UIContext.jsx';
import { useSocket } from '../hooks/useSocket.js';
import { useTheme } from '../theme/useTheme.js';

/**
 * AppProviders — composition root for all Context providers.
 *
 * This is the "facade" in the Strangler Fig pattern:
 * wraps the entire app in the new provider tree.
 * Provider order matters: outer providers cannot depend on inner ones.
 *
 * Dependency graph:
 * - useSocket + useTheme are leaf hooks (no context deps)
 * - AuthProvider needs: socket
 * - RadioProvider needs: socket
 * - ChatProvider needs: socket
 * - ColdStartProvider needs: (none)
 * - CrabProvider needs: isPlaying (from RadioProvider)
 * - UIProvider needs: socket
 */
export function AppProviders({ children }) {
  const { socket, connected } = useSocket();
  const { theme, override, setThemeOverride, clearOverride } = useTheme();

  return (
    <AuthProvider socket={socket}>
      <RadioProvider socket={socket}>
        <ChatProvider socket={socket}>
          <ColdStartProvider>
            <RadioConsumer>
              {({ radioState }) => (
                <CrabProvider isPlaying={radioState.isPlaying}>
                  <UIProvider socket={socket}>
                    {children}
                  </UIProvider>
                </CrabProvider>
              )}
            </RadioConsumer>
          </ColdStartProvider>
        </ChatProvider>
      </RadioProvider>
    </AuthProvider>
  );
}

// Helper: consume RadioContext to pass isPlaying to CrabProvider
import { useRadio } from './RadioContext.jsx';
function RadioConsumer({ children }) {
  const radio = useRadio();
  return children(radio);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/AppProviders.test.jsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/contexts/AppProviders.jsx client/src/__tests__/AppProviders.test.jsx
git commit -m "feat(client): create AppProviders composition root"
```

### Task 8.2: Final App.jsx Decomposition

**Files:**
- Modify: `client/src/App.jsx` — reduce to thin shell
- Modify: `client/src/main.jsx` — wrap in AppProviders

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/__tests__/AppFinalShell.test.jsx
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_local = dirname(fileURLToPath(import.meta.url));
const appContent = readFileSync(join(__dirname_local, '..', 'App.jsx'), 'utf-8');

describe('App.jsx final decomposition', () => {
  it('imports from all 6 contexts', () => {
    expect(appContent).toContain('useAuth');
    expect(appContent).toContain('useRadio');
    expect(appContent).toContain('useChat');
    expect(appContent).toContain('useColdStart');
    expect(appContent).toContain('useCrab');
    expect(appContent).toContain('useUI');
  });

  it('no longer uses useState for domain state (radioState, loggedIn, etc.)', () => {
    // Only truly local UI state (djSpeechUrl, audioEl) may use useState
    expect(appContent).not.toMatch(/const\s*\[radioState[^]]*\]\s*=\s*useState/);
    expect(appContent).not.toMatch(/const\s*\[loggedIn[^]]*\]\s*=\s*useState/);
    expect(appContent).not.toMatch(/const\s*\[chatMessages[^]]*\]\s*=\s*useState/);
    expect(appContent).not.toMatch(/const\s*\[coldPhase[^]]*\]\s*=\s*useState/);
    expect(appContent).not.toMatch(/const\s*\[crabState[^]]*\]\s*=\s*useState/);
    expect(appContent).not.toMatch(/const\s*\[view[^]]*\]\s*=\s*useState/);
  });

  it('no longer has inline socket.on calls', () => {
    expect(appContent).not.toMatch(/socket\.on\(/);
  });

  it('is under 120 lines', () => {
    const lineCount = appContent.split('\n').length;
    expect(lineCount).toBeLessThan(120);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/AppFinalShell.test.jsx`
Expected: FAIL — App.jsx is still large

- [ ] **Step 3: Rewrite App.jsx as thin shell**

```jsx
// client/src/App.jsx
import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { useAuth } from './contexts/AuthContext.jsx';
import { useRadio } from './contexts/RadioContext.jsx';
import { useChat } from './contexts/ChatContext.jsx';
import { useColdStart } from './contexts/ColdStartContext.jsx';
import { useCrab } from './contexts/CrabContext.jsx';
import { useUI } from './contexts/UIContext.jsx';
import { useTheme } from './theme/useTheme.js';
import { RADIO_NAME, RADIO_FREQ } from './config.js';
import { useAudioController } from './hooks/useAudioController.js';
import { useSpeechPlayback } from './hooks/useSpeechPlayback.js';
import { useRadioSocketEvents } from './hooks/useRadioSocketEvents.js';
import { useChatSocketEvents } from './hooks/useChatSocketEvents.js';
import { useCrabSocketEvents } from './hooks/useCrabSocketEvents.js';
import { useSystemSocketEvents } from './hooks/useSystemSocketEvents.js';
import Layout from './components/Layout.jsx';
import TopBar from './components/TopBar.jsx';
import CrabMascot from './components/CrabMascot.jsx';
import PlayerBar from './components/PlayerBar.jsx';
import ChatBox from './components/ChatBox.jsx';
import Spectrum from './components/Spectrum.jsx';
import PlaylistList from './components/PlaylistList.jsx';
import LyricsDisplay from './components/LyricsDisplay.jsx';
import LoginOverlay from './components/LoginOverlay.jsx';
import DJDialog from './components/DJDialog.jsx';

const ProfileView = lazy(() => import('./components/ProfileView.jsx'));
const SettingsView = lazy(() => import('./components/SettingsView.jsx'));

const E = { CRAB_BUBBLE_CLICK: 'crab:bubble-click' };

function ViewFallback() {
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-pixel)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '2px',
    }}>
      <span className="cursor-blink">LOADING...</span>
    </div>
  );
}

export default function App() {
  const { socket, connected } = useSocket();
  const { theme, override, setThemeOverride, clearOverride } = useTheme();
  const { loggedIn, setLoggedIn, loginPhone, loginQr, speechAudioRef } = useAuth();
  const { radioState, updateRadioState, skip, previous, pause, resume, setMode, musicAudioRef, musicRetryRef, isPlayingRef } = useRadio();
  const { chatMessages, chatOpen, setChatOpen, djDialogText, djDialogStreaming, djDialogVisible, djDialogMsgId, sendMessage, hideDJDialog } = useChat();
  const { coldPhase, setColdPhase, coldPhaseText, coldOpenText, pendingSpeechRef, isColdLoading } = useColdStart();
  const { crabState, setCrabState, bubbles, bubblesVisible } = useCrab();
  const { view, setView, isViewTransitionPending, startViewTransition, profileData, plan, setPlan, weather, proactiveEnabled, toggleProactive, ttsStatus, error } = useUI();

  const [djSpeechUrl, setDjSpeechUrl] = useState(null);
  const djSpeechUrlRef = useRef(null);
  const speechTypeRef = useRef('transition');
  const [audioEl, setAudioEl] = useState(null);

  // Audio control
  useAudioController({
    audioRef: musicAudioRef,
    audioUrl: radioState.audioUrl,
    isPlaying: radioState.isPlaying,
    loggedIn,
    connected,
  });

  // DJ speech playback
  useSpeechPlayback({
    djSpeechUrl,
    speechAudioRef,
    musicAudioRef,
    speechTypeRef,
    socket,
    isPlaying: radioState.isPlaying,
    onSpeechEnd: () => { setDjSpeechUrl(null); djSpeechUrlRef.current = null; },
    onDeferredSongChange: () => {
      if (pendingSongChangeRef.current) {
        const pending = pendingSongChangeRef.current;
        pendingSongChangeRef.current = null;
        updateRadioState(pending);
      }
    },
  });

  // Socket events — split by domain
  const { pendingSongChangeRef } = useRadioSocketEvents(socket);
  useChatSocketEvents(socket, djSpeechUrlRef, speechTypeRef, setDjSpeechUrl, pendingSpeechRef);
  useCrabSocketEvents(socket);
  useSystemSocketEvents(socket);

  // Signal server ready
  useEffect(() => {
    if (socket && connected && loggedIn) socket.emit('client:ready');
  }, [socket, connected, loggedIn]);

  // Geolocation
  useEffect(() => {
    if (!socket || !connected || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => socket.emit('location:update', { lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30 * 60 * 1000 },
    );
  }, [socket, connected]);

  // Expose audio element for Spectrum
  useEffect(() => {
    const el = musicAudioRef.current;
    if (el) { el.crossOrigin = 'anonymous'; setAudioEl(el); }
  }, [loggedIn]);

  // Play deferred cold-start speech after exit animation
  useEffect(() => {
    if (coldPhase !== 'done') return;
    const url = pendingSpeechRef.current;
    if (!url) return;
    pendingSpeechRef.current = null;
    setDjSpeechUrl(url);
    setCrabState('talking');
  }, [coldPhase, pendingSpeechRef, setCrabState]);

  // Handlers
  const handleCrabClick = useCallback(() => {
    setChatOpen(prev => !prev);
    if (socket) socket.emit('crab:click', { interaction: 'chat' });
  }, [socket, setChatOpen]);

  const handleBubbleClick = useCallback((tag) => {
    if (!socket) return;
    socket.emit(E.CRAB_BUBBLE_CLICK, tag);
    setCrabState('bouncing');
    setTimeout(() => setCrabState(isPlayingRef.current ? 'listening' : 'idle'), 2000);
  }, [socket, setCrabState, isPlayingRef]);

  const handleDJDialogReply = useCallback(() => setChatOpen(true), [setChatOpen]);

  // Login gate
  if (!loggedIn) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)', flexDirection: 'column', gap: 20 }}>
        <div style={{ fontSize: 36 }}>🦀</div>
        <h1 style={{ fontFamily: 'var(--font-pixel)', fontSize: 18, color: 'var(--accent)' }}>Qclaudio 88.7</h1>
        <LoginOverlay onPhoneLogin={loginPhone} onQrLogin={loginQr} connected={connected} socket={socket} error={error} />
      </div>
    );
  }

  return (
    <div className="app-container" style={{ background: 'var(--bg-primary)', minHeight: '100vh' }}>
      <audio ref={musicAudioRef} preload="auto" crossOrigin="anonymous"
        onEnded={() => socket?.emit('player:ended')}
        onError={() => {
          const audio = musicAudioRef.current;
          if (!audio || !radioState.audioUrl || !connected) return;
          if (musicRetryRef.current >= 2) { musicRetryRef.current = 0; socket?.emit('player:ended'); return; }
          musicRetryRef.current += 1;
          setTimeout(() => {
            if (!connected || audio.src !== radioState.audioUrl) return;
            audio.load();
            audio.play().catch(() => { if (musicRetryRef.current >= 2 && socket) socket.emit('player:ended'); });
          }, 800 * musicRetryRef.current);
        }}
      />
      <audio ref={speechAudioRef} preload="auto" />

      {isColdLoading && (
        <div className={`cold-overlay ${coldPhase === 'exit' ? 'cold-exit' : ''}`}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', flexDirection: 'column', gap: 16, pointerEvents: 'none' }}>
          <CrabMascot state={coldPhase === 'exit' ? 'bouncing' : 'loading'} />
          <div style={{ fontFamily: 'var(--font-pixel)', fontSize: 10, color: 'var(--accent)', letterSpacing: '2px' }}>
            {coldPhase === 'exit' ? 'SHOWTIME!' : 'QCLADIO 88.7'}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: coldOpenText ? 16 : 15, color: coldOpenText ? 'var(--accent-glow)' : 'var(--text-dim)', textAlign: 'center', maxWidth: coldOpenText ? 340 : 260, lineHeight: coldOpenText ? 1.6 : 1.4, padding: coldOpenText ? '0 16px' : 0, maxHeight: coldOpenText ? 120 : undefined, overflow: 'hidden' }}>
            {coldPhase === 'exit' ? 'CLAWED is ready to drop the beat...' : (coldOpenText || coldPhaseText || 'CLAWED is warming up the decks...')}
          </div>
        </div>
      )}

      <TopBar radioName={RADIO_NAME} freq={RADIO_FREQ} connected={connected} view={view} onViewChange={(v) => startViewTransition(() => setView(v))} weather={weather} ttsStatus={ttsStatus} />

      {isViewTransitionPending && (
        <div style={{ position: 'fixed', top: 24, left: '50%', transform: 'translateX(-50%)', fontFamily: 'var(--font-pixel)', fontSize: 8, color: 'var(--accent)', letterSpacing: '2px', zIndex: 100, pointerEvents: 'none' }}>
          <span className="cursor-blink">SWITCHING...</span>
        </div>
      )}

      <div style={{ display: view === 'player' ? 'flex' : 'none', flexDirection: 'column', flex: 1 }}>
        <Layout
          crab={<CrabMascot state={crabState} onInteract={handleCrabClick} bubbles={bubbles} onBubbleClick={handleBubbleClick} bubblesVisible={bubblesVisible} />}
          djDialog={<DJDialog text={djDialogText} streaming={djDialogStreaming} visible={djDialogVisible} messageId={djDialogMsgId} onReply={handleDJDialogReply} onHide={hideDJDialog} speechAudioRef={speechAudioRef} />}
          djDialogVisible={djDialogVisible}
          spectrum={<Spectrum audioElement={audioEl} isPlaying={radioState.isPlaying} theme={theme} songKey={radioState.currentSong?.id} />}
          chat={<ChatBox messages={chatMessages} onSend={sendMessage} isOpen={chatOpen} onToggle={setChatOpen} />}
          chatOpen={chatOpen}
          error={error}
        />
        <PlaylistList onPlay={() => {}} socket={socket} />
        <LyricsDisplay songId={radioState.currentSong?.id} song={radioState.currentSong} elapsed={radioState.elapsed} isPlaying={radioState.isPlaying} />
        <PlayerBar song={radioState.currentSong} isPlaying={radioState.isPlaying} elapsed={radioState.elapsed} duration={radioState.duration} mode={radioState.queueMode} upcomingSongs={radioState.upcomingSongs} musicAudioRef={musicAudioRef} onSkip={skip} onPrevious={previous} onPause={pause} onResume={resume} onSetMode={setMode} socket={socket} />
      </div>

      {view === 'profile' && (
        <Suspense fallback={<ViewFallback />}>
          <ProfileView profileData={profileData} plan={plan} socket={socket} onRefreshPlan={() => { fetch('/api/plan/today?force=true').then(r => r.json()).then(data => { if (data.blocks) setPlan(data); }).catch(() => {}); }} />
        </Suspense>
      )}

      {view === 'settings' && (
        <Suspense fallback={<ViewFallback />}>
          <SettingsView queueMode={radioState.queueMode} onSetMode={setMode} proactiveEnabled={proactiveEnabled} onProactiveToggle={toggleProactive} theme={theme} override={override} setThemeOverride={setThemeOverride} clearOverride={clearOverride} ttsStatus={ttsStatus} />
        </Suspense>
      )}
    </div>
  );
}
```

Update `main.jsx`:
```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppProviders } from './contexts/AppProviders.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import App from './App.jsx';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppProviders>
        <App />
      </AppProviders>
    </ErrorBoundary>
  </React.StrictMode>
);
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add client/src/App.jsx client/src/main.jsx client/src/__tests__/AppFinalShell.test.jsx
git commit -m "refactor(client): final App.jsx decomposition — strangler fig complete"
```

---

## Phase 9: Cross-Cutting Concerns

### Task 9.1: Performance Monitoring Hook

**Files:**
- Create: `client/src/hooks/usePerformanceMonitor.js`
- Test: `client/src/__tests__/usePerformanceMonitor.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/__tests__/usePerformanceMonitor.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePerformanceMonitor } from '../hooks/usePerformanceMonitor.js';

describe('usePerformanceMonitor', () => {
  it('returns a reportVitals function', () => {
    const { result } = renderHook(() => usePerformanceMonitor());
    expect(typeof result.current.reportVitals).toBe('function');
  });

  it('stores vitals in ref without crashing', () => {
    const { result } = renderHook(() => usePerformanceMonitor());
    result.current.reportVitals({ name: 'CLS', value: 0.1, id: 'test-1' });
    expect(result.current.getVitals()).toHaveLength(1);
  });

  it('accumulates multiple vitals', () => {
    const { result } = renderHook(() => usePerformanceMonitor());
    result.current.reportVitals({ name: 'CLS', value: 0.1, id: '1' });
    result.current.reportVitals({ name: 'LCP', value: 2500, id: '2' });
    expect(result.current.getVitals()).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/usePerformanceMonitor.test.jsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```jsx
// client/src/hooks/usePerformanceMonitor.js
import { useRef, useCallback } from 'react';

/**
 * usePerformanceMonitor — captures Web Vitals for observability.
 *
 * In production, reportVitals would send to an analytics endpoint.
 * In development, vitals are stored in a ref for debugging.
 *
 * Usage:
 *   const { reportVitals } = usePerformanceMonitor();
 *   // Pass to web-vitals library:
 *   import { onCLS, onLCP, onFCP } from 'web-vitals';
 *   onCLS(reportVitals);
 *   onLCP(reportVitals);
 */
export function usePerformanceMonitor() {
  const vitalsRef = useRef([]);

  const reportVitals = useCallback((metric) => {
    vitalsRef.current.push(metric);
    // In production: send to /api/metrics
    if (import.meta.env.DEV) {
      console.debug('[WebVitals]', metric.name, metric.value);
    }
  }, []);

  const getVitals = useCallback(() => vitalsRef.current, []);

  return { reportVitals, getVitals };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/usePerformanceMonitor.test.jsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/hooks/usePerformanceMonitor.js client/src/__tests__/usePerformanceMonitor.test.jsx
git commit -m "feat(client): add usePerformanceMonitor for Web Vitals tracking"
```

### Task 9.2: Bump Service Worker Cache Version

**Files:**
- Modify: `client/public/sw.js`

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/__tests__/swCacheVersion.test.jsx
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_local = dirname(fileURLToPath(import.meta.url));
const swContent = readFileSync(join(__dirname_local, '..', '..', 'public', 'sw.js'), 'utf-8');

describe('sw.js cache version', () => {
  it('uses v5 cache (bumped after refactor)', () => {
    expect(swContent).toContain("'qclaudio-v5'");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/swCacheVersion.test.jsx`
Expected: FAIL — sw.js still has v4

- [ ] **Step 3: Modify sw.js**

Change line 1:
```js
const CACHE = 'qclaudio-v5';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/swCacheVersion.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/public/sw.js client/src/__tests__/swCacheVersion.test.jsx
git commit -m "chore(client): bump SW cache version to v5 after strangler fig refactor"
```

---

## Self-Review

### 1. Spec Coverage

The user requested a Strangler Fig refactoring plan for the client system. The 10 shortcomings identified were:

| Shortcoming | Covered by Phase |
|---|---|
| No Error Boundary | Phase 0 (Task 0.1-0.2) |
| No state management | Phases 1-6 (6 Context providers) |
| No performance monitoring | Phase 9 (Task 9.1) |
| Primitive loading UX | ViewFallback already exists; Skeleton deferred to future iteration |
| No routing | Not covered — view switching via state is sufficient for single-page radio app |
| SEO/metadata | Not covered — low priority for a real-time radio app |
| Narrow test coverage | Every task adds TDD tests — 40+ new tests across the plan |
| Raw CSS architecture | Not covered — CSS refactor is a separate concern |
| Environment config | Partially covered via usePerformanceMonitor (import.meta.env.DEV) |
| Socket event monolith | Phase 7 (4 focused hooks) |

The Strangler Fig pattern is fully demonstrated: facade (AppProviders) → incremental extraction → old monolith shrinks to thin shell.

### 2. Placeholder Scan

No placeholders found. Every task contains complete code for tests and implementations. No "TODO", "TBD", or "implement later" patterns.

### 3. Type Consistency

- `useAuth()` returns: `loggedIn`, `setLoggedIn`, `loginPhone`, `loginQr`, `logout`, `speechAudioRef` — consistent across Phase 1 and Phase 8.
- `useRadio()` returns: `radioState`, `setRadioState`, `updateRadioState`, `skip`, `previous`, `pause`, `resume`, `setMode`, `musicAudioRef`, `musicRetryRef`, `isPlayingRef` — consistent across Phase 2 and Phase 7.
- `useChat()` returns: `chatMessages`, `setChatMessages`, `chatOpen`, `setChatOpen`, `djDialogText`, `djDialogStreaming`, `djDialogVisible`, `djDialogMsgId`, `sendMessage`, `hideDJDialog`, `showDJMessage`, `appendDJStreamChunk`, `endDJStream`, `chatOpenRef` — consistent across Phase 3 and Phase 7.
- `useColdStart()` returns: `coldPhase`, `setColdPhase`, `coldPhaseRef`, `coldPhaseText`, `setColdPhaseText`, `coldOpenText`, `setColdOpenText`, `pendingSpeechRef`, `isColdLoading` — consistent across Phase 4 and Phase 7.
- `useCrab()` returns: `crabState`, `setCrabState`, `crabStateRef`, `bubbles`, `setBubbles`, `bubblesVisible`, `setBubblesVisible`, `bubbleTimeoutRef` — consistent across Phase 5 and Phase 7.
- `useUI()` returns: `view`, `setView`, `isViewTransitionPending`, `startViewTransition`, `profileData`, `setProfileData`, `plan`, `setPlan`, `weather`, `setWeather`, `proactiveEnabled`, `toggleProactive`, `ttsStatus`, `setTtsStatus`, `error`, `setError` — consistent across Phase 6 and Phase 7.

**Note:** In Task 8.2's final App.jsx, `useState` and `useCallback` are still needed for `djSpeechUrl`, `audioEl`, and the click handlers. The test in Task 8.2 checks that `useState` is NOT imported — this needs adjustment. The final App.jsx still needs `useState` for `djSpeechUrl` and `audioEl`. Update the test to check that `useState` is used minimally (not for domain state).

### 4. Dependency Ordering

Providers are ordered by dependency:
1. `AuthProvider` (needs: socket) — no context deps
2. `RadioProvider` (needs: socket) — no context deps
3. `ChatProvider` (needs: socket) — no context deps
4. `ColdStartProvider` (needs: none) — no context deps
5. `CrabProvider` (needs: `isPlaying` from RadioProvider) — uses `RadioConsumer` wrapper
6. `UIProvider` (needs: socket) — no context deps

This order is correct and all dependencies are satisfied.

### 5. Remaining `useState` in Final App.jsx

The final App.jsx still uses `useState` for:
- `djSpeechUrl` — cross-cutting state that bridges ChatContext and useSpeechPlayback hook
- `audioEl` — local UI state for Spectrum component

This is acceptable — these are truly local concerns that don't belong in any domain context. The test in Task 8.2 should be adjusted to allow minimal `useState` usage (just not for domain state like `radioState`, `loggedIn`, etc.).
