import { useState, useEffect, useCallback, useRef, lazy, Suspense, useTransition } from 'react';
import { useTheme } from './theme/useTheme.js';
import { useAuth } from './contexts/AuthContext.jsx';
import { RADIO_NAME, RADIO_FREQ } from './config.js';
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
import { useSpeechPlayback } from './hooks/useSpeechPlayback.js';
import { useChatHistory } from './hooks/useChatHistory.js';

// Lazy-loaded non-first-screen views (code splitting)
const ProfileView = lazy(() => import('./components/ProfileView.jsx'));
const SettingsView = lazy(() => import('./components/SettingsView.jsx'));

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

const E = {
  RADIO_STATE: 'radio:state',
  SONG_CHANGE: 'radio:song-change',
  DJ_MESSAGE: 'radio:dj-message',
  DJ_SPEECH_START: 'radio:dj-speech-start',
  DJ_SPEECH_END: 'radio:dj-speech-end',
  DJ_STREAM_CHUNK: 'radio:dj-stream-chunk',
  DJ_STREAM_END: 'radio:dj-stream-end',
  QUEUE_UPDATE: 'radio:queue-update',
  PLAYBACK_POSITION: 'radio:playback-position',
  PAUSE: 'radio:pause',
  RESUME: 'radio:resume',
  LOGIN_REQUIRED: 'radio:login-required',
  ERROR: 'radio:error',
  CRAB_ANIMATION: 'crab:animation',
  CRAB_BUBBLES: 'crab:bubbles',
  CRAB_BUBBLE_CLICK: 'crab:bubble-click',
  SYNC_TIME: 'sync:time',
  PLAN_UPDATE: 'plan:update',
};

export default function App({ socket, connected }) {
  const { theme, override, setThemeOverride, clearOverride } = useTheme();
  const { loggedIn, setLoggedIn, loginPhone: handleLoginPhone, loginQr: handleLoginQr, speechAudioRef: authSpeechAudioRef } = useAuth();
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
  const [chatMessages, setChatMessages] = useChatHistory(socket);
  const [djSpeechUrl, setDjSpeechUrl] = useState(null);
  const djSpeechUrlRef = useRef(null);
  const pendingSongChangeRef = useRef(null);
  const [crabState, setCrabState] = useState('idle');
  const crabStateRef = useRef(crabState);
  const [bubbles, setBubbles] = useState([]);
  const [bubblesVisible, setBubblesVisible] = useState(false);
  const bubbleTimeoutRef = useRef(null);
  crabStateRef.current = crabState;
  const isPlayingRef = useRef(false);
  isPlayingRef.current = radioState.isPlaying;
  const musicAudioRef = useRef(null);
  const musicRetryRef = useRef(0);
  const speechTypeRef = useRef('transition');
  const [audioEl, setAudioEl] = useState(null);

  const [chatOpen, setChatOpen] = useState(false);
  const chatOpenRef = useRef(false);
  chatOpenRef.current = chatOpen;
  const [djDialogText, setDjDialogText] = useState('');
  const [djDialogStreaming, setDjDialogStreaming] = useState(false);
  const [djDialogVisible, setDjDialogVisible] = useState(false);
  const [djDialogMsgId, setDjDialogMsgId] = useState('');
  const djDialogTextRef = useRef('');
  const djStreamIdRef = useRef(null);
  const [view, setView] = useState('player');
  const [isViewTransitionPending, startViewTransition] = useTransition();
  const [profileData, setProfileData] = useState(null);
  const [error, setError] = useState(null);
  const [plan, setPlan] = useState(null);
  const [weather, setWeather] = useState('');
  const [proactiveEnabled, setProactiveEnabled] = useState(true);
  const [coldPhase, setColdPhase] = useState('loading'); // 'loading' | 'exit' | 'done'
  const [coldPhaseText, setColdPhaseText] = useState('');
  const [coldOpenText, setColdOpenText] = useState('');
  const [ttsStatus, setTtsStatus] = useState({ available: null, provider: null, reason: '' });
  const coldPhaseRef = useRef(coldPhase);
  coldPhaseRef.current = coldPhase;
  const pendingSpeechRef = useRef(null); // cold-start speech URL, played after exit animation

  // Expose audio element for Spectrum
  useEffect(() => {
    const el = musicAudioRef.current;
    if (el) {
      el.crossOrigin = 'anonymous';
      setAudioEl(el);
    }
  }, [loggedIn]);

  // Play music when audioUrl arrives OR login completes
  useEffect(() => {
    if (!loggedIn) return;
    const audio = musicAudioRef.current;
    if (!audio || !radioState.audioUrl) return;
    if (audio.src === radioState.audioUrl) return; // already loaded
    musicRetryRef.current = 0; // reset retry counter for new song
    audio.src = radioState.audioUrl;
    audio.load();
    audio.play().catch(() => {});
  }, [radioState.audioUrl, loggedIn]);

  // Sync play/pause
  useEffect(() => {
    const audio = musicAudioRef.current;
    if (!audio || !radioState.audioUrl) return;
    if (!connected) return; // Don't play when disconnected
    if (radioState.isPlaying) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [radioState.isPlaying, loggedIn, connected]);

  // Pause all audio when socket disconnects (server down / killed)
  useEffect(() => {
    if (connected) return;
    const music = musicAudioRef.current;
    const speech = authSpeechAudioRef.current;
    if (music) { music.pause(); }
    if (speech) { speech.pause(); }
  }, [connected]);

  // DJ speech — managed by useSpeechPlayback hook (comprehensive cleanup on URL change)
  useSpeechPlayback({
    djSpeechUrl,
    speechAudioRef: authSpeechAudioRef,
    musicAudioRef,
    speechTypeRef,
    socket,
    isPlaying: radioState.isPlaying,
    onSpeechEnd: () => {
      setDjSpeechUrl(null);
      djSpeechUrlRef.current = null;
    },
    onDeferredSongChange: () => {
      if (pendingSongChangeRef.current) {
        const pending = pendingSongChangeRef.current;
        pendingSongChangeRef.current = null;
        setRadioState(prev => ({ ...prev, ...pending }));
      }
    },
  });

  useEffect(() => {
    if (!socket) return;
    socket.on(E.RADIO_STATE, (state) => setRadioState(prev => ({ ...prev, ...state })));
    socket.on(E.SONG_CHANGE, (data) => {
      const newSongState = { currentSong: data.song, startedAt: data.startedAt, isPlaying: true, audioUrl: data.audioUrl || null };
      // If speech is playing, defer song change until speech finishes
      if (djSpeechUrlRef.current) {
        pendingSongChangeRef.current = newSongState;
        // Update song info but don't switch audio yet
        setRadioState(prev => ({ ...prev, currentSong: data.song, startedAt: data.startedAt, isPlaying: true }));
      } else {
        setRadioState(prev => ({ ...prev, ...newSongState }));
      }
      setCrabState('bouncing');
      setTimeout(() => setCrabState(isPlayingRef.current ? 'listening' : 'idle'), 3000);
      if (coldPhaseRef.current === 'loading') setColdPhase('exit');
      else setColdPhase('done');
    });
    socket.on(E.DJ_MESSAGE, (data) => {
      setChatMessages(prev => [...prev, {
        id: `dj-msg-${Date.now()}`,
        role: 'assistant',
        content: data.text,
        isTransition: true,
      }]);
      // Show DJ dialog (only when chat panel is closed)
      if (!chatOpenRef.current && data.text) {
        djDialogTextRef.current = data.text;
        setDjDialogText(data.text);
        setDjDialogStreaming(false);
        setDjDialogVisible(true);
        setDjDialogMsgId(`dj-msg-${Date.now()}`);
      }
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
    socket.on(E.DJ_SPEECH_END, () => { setDjSpeechUrl(null); djSpeechUrlRef.current = null; setCrabState(isPlayingRef.current ? 'listening' : 'idle'); });
    socket.on(E.DJ_STREAM_CHUNK, (data) => {
      setChatMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.id === data.messageId && last.role === 'assistant') {
          return [...prev.slice(0, -1), { ...last, content: last.content + data.token }];
        }
        return [...prev, { id: data.messageId, role: 'assistant', content: data.token }];
      });
      // Accumulate text for DJ dialog
      if (!chatOpenRef.current) {
        if (djStreamIdRef.current !== data.messageId) {
          djStreamIdRef.current = data.messageId;
          djDialogTextRef.current = data.token || '';
          setDjDialogMsgId(data.messageId);
        } else {
          djDialogTextRef.current += data.token || '';
        }
        setDjDialogText(djDialogTextRef.current);
        setDjDialogStreaming(true);
        setDjDialogVisible(true);
      }
    });
    socket.on(E.DJ_STREAM_END, () => {
      setDjDialogStreaming(false);
      djStreamIdRef.current = null;
    });
    socket.on('cold-start:phase', (data) => {
      if (data.phase === 'writing') { setColdPhaseText('CLAWED is writing the opening...'); setColdOpenText(''); }
      else if (data.phase === 'speaking') { setColdPhaseText('CLAWED is about to speak...'); setColdOpenText(''); }
      else if (data.phase === 'text-only') {
        if (data.text) {
          setColdOpenText(data.text);
          setColdPhaseText('');
        } else {
          setColdPhaseText('Technical difficulties — starting music...');
          setColdOpenText('');
        }
      }
    });
    socket.on('tts:status', (data) => setTtsStatus(data));
    socket.on(E.QUEUE_UPDATE, (data) => setRadioState(prev => ({ ...prev, upcomingSongs: data.upcomingSongs, queueMode: data.mode || prev.queueMode })));
    socket.on(E.PLAYBACK_POSITION, (pos) => setRadioState(prev => ({ ...prev, elapsed: pos.elapsed, duration: pos.duration })));
    socket.on(E.PAUSE, () => { setRadioState(prev => ({ ...prev, isPlaying: false })); setCrabState('idle'); });
    socket.on(E.RESUME, (data) => setRadioState(prev => ({ ...prev, isPlaying: true, startedAt: data.startedAt })));
    socket.on(E.LOGIN_REQUIRED, () => setLoggedIn(false));
    socket.on(E.PLAN_UPDATE, (data) => { setPlan(data); });
    socket.on(E.ERROR, (err) => { setError(err.message); setTimeout(() => setError(null), 5000); });
    socket.on(E.CRAB_BUBBLES, ({ bubbles: newBubbles }) => {
      setBubbles(newBubbles);
      setBubblesVisible(true);
      setCrabState('blowing');
      setTimeout(() => {
        setCrabState(prev => prev === 'blowing' ? (isPlayingRef.current ? 'listening' : 'idle') : prev);
      }, 3000);
      if (bubbleTimeoutRef.current) clearTimeout(bubbleTimeoutRef.current);
      bubbleTimeoutRef.current = setTimeout(() => setBubblesVisible(false), 30000);
    });
    socket.on('auth:login-success', () => setLoggedIn(true));
    // Fetch initial plan
    fetch('/api/plan/today').then(r => r.json()).then(data => {
      if (data.blocks) setPlan(data);
    }).catch(() => {});
    return () => {
      socket.off(E.RADIO_STATE);
      socket.off(E.SONG_CHANGE);
      socket.off(E.CRAB_BUBBLES);
      if (bubbleTimeoutRef.current) clearTimeout(bubbleTimeoutRef.current);
    };
  }, [socket]);

  // Signal server that client is ready for cold start (logged in + connected)
  useEffect(() => {
    if (socket && connected && loggedIn) {
      socket.emit('client:ready');
    }
  }, [socket, connected, loggedIn]);

  // Send browser geolocation to server for accurate weather
  useEffect(() => {
    if (!socket || !connected || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        socket.emit('location:update', { lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => {}, // silently ignore denial
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30 * 60 * 1000 },
    );
  }, [socket, connected]);

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

  // Random idle ↔ listening toggle during music playback
  useEffect(() => {
    if (!radioState.isPlaying) return;

    const scheduleNext = () => {
      const delay = 10000 + Math.random() * 20000; // 10-30s random
      return setTimeout(() => {
        const cur = crabStateRef.current;
        if (cur === 'idle') setCrabState('listening');
        else if (cur === 'listening') setCrabState('idle');
        // If talking/bouncing/loading, skip this cycle and reschedule
        scheduleNextRef.current = scheduleNext();
      }, delay);
    };

    const scheduleNextRef = { current: null };
    scheduleNextRef.current = scheduleNext();
    return () => clearTimeout(scheduleNextRef.current);
  }, [radioState.isPlaying]);

  useEffect(() => {
    if (view === 'profile') {
      fetch('/api/taste').then(r => r.json()).then(setProfileData).catch(() => {});
    }
  }, [view]);

  const handleSkip = useCallback(() => { if (socket) socket.emit('player:skip'); }, [socket]);
  const handlePrevious = useCallback(() => { if (socket) socket.emit('player:previous'); }, [socket]);
  const handlePause = useCallback(() => { if (socket) socket.emit('player:pause'); }, [socket]);
  const handleResume = useCallback(() => { if (socket) socket.emit('player:resume'); }, [socket]);
  const handleSetMode = useCallback((mode) => { if (socket) socket.emit('player:set-mode', { mode }); }, [socket]);
  const handleChatMessage = useCallback((text) => {
    if (!socket) return;
    setChatMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: text }]);
    socket.emit('chat:message', { text });
  }, [socket]);
  const handleCrabClick = useCallback(() => {
    setChatOpen(prev => !prev);
    if (socket) socket.emit('crab:click', { interaction: 'chat' });
  }, [socket]);
  const handleBubbleClick = useCallback((tag) => {
    if (!socket) return;
    socket.emit(E.CRAB_BUBBLE_CLICK, tag);
    setCrabState('bouncing');
    setTimeout(() => setCrabState(isPlayingRef.current ? 'listening' : 'idle'), 2000);
  }, [socket]);
  const handleDJDialogReply = useCallback(() => {
    setChatOpen(true);
  }, []);
  const handleDJDialogHide = useCallback(() => {
    setDjDialogVisible(false);
  }, []);
  // Hide DJ dialog when chat panel opens
  useEffect(() => {
    if (chatOpen) setDjDialogVisible(false);
  }, [chatOpen]);
  const handleProactiveToggle = useCallback(() => {
    const next = !proactiveEnabled;
    setProactiveEnabled(next);
    if (socket) socket.emit('proactive:toggle', { enabled: next });
  }, [socket, proactiveEnabled]);

  // Exit animation timer: fades out overlay when first song arrives
  useEffect(() => {
    if (coldPhase !== 'exit') return;
    const timer = setTimeout(() => setColdPhase('done'), 900);
    return () => clearTimeout(timer);
  }, [coldPhase]);

  // Play deferred cold-start speech after exit animation completes
  useEffect(() => {
    if (coldPhase !== 'done') return;
    const url = pendingSpeechRef.current;
    if (!url) return;
    pendingSpeechRef.current = null;
    setDjSpeechUrl(url);
    setCrabState('talking');
  }, [coldPhase]);

  if (!loggedIn) {
    return (
      <div>
        {/* fallback - LoginOverlay */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: 36 }}>🦀</div>
          <h1 style={{ fontFamily: 'var(--font-pixel)', fontSize: 18, color: 'var(--accent)' }}>Qclaudio 88.7</h1>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--text-secondary)' }}>Connected: {String(connected)} | Auth: checking...</p>
          <LoginOverlay onPhoneLogin={handleLoginPhone} onQrLogin={handleLoginQr} connected={connected} socket={socket} error={error} />
        </div>
      </div>
    );
  }

  const isColdLoading = coldPhase !== 'done';

  return (
    <div className="app-container" style={{ background: 'var(--bg-primary)', minHeight: '100vh' }}>
      <audio ref={musicAudioRef} preload="auto" crossOrigin="anonymous"
        onEnded={() => { if (socket) socket.emit('player:ended'); }}
        onError={() => {
          const audio = musicAudioRef.current;
          if (!audio || !radioState.audioUrl) return;
          if (!connected) return; // Don't retry when server is down
          if (musicRetryRef.current >= 2) {
            // Exhausted retries — skip to next song instead of stalling
            musicRetryRef.current = 0;
            if (socket) socket.emit('player:ended');
            return;
          }
          musicRetryRef.current += 1;
          const retryDelay = 800 * musicRetryRef.current;
          setTimeout(() => {
            if (!connected) return; // Server went down during retry delay
            if (audio.src !== radioState.audioUrl) return; // song changed
            audio.load();
            audio.play().catch(() => {
              if (musicRetryRef.current >= 2 && socket) socket.emit('player:ended');
            });
          }, retryDelay);
        }}
      />
      <audio ref={authSpeechAudioRef} preload="auto" />

      {/* Cold-start loading overlay */}
      {isColdLoading && (
        <div
          className={`cold-overlay ${coldPhase === 'exit' ? 'cold-exit' : ''}`}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--bg-primary)', flexDirection: 'column', gap: 16,
            pointerEvents: 'none',
          }}
        >
          <CrabMascot state={coldPhase === 'exit' ? 'bouncing' : 'loading'} />
          <div style={{ fontFamily: 'var(--font-pixel)', fontSize: 10, color: 'var(--accent)', letterSpacing: '2px' }}>
            {coldPhase === 'exit' ? 'SHOWTIME!' : 'QCLADIO 88.7'}
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
            {coldPhase === 'exit' ? 'CLAWED is ready to drop the beat...' : (coldOpenText || coldPhaseText || 'CLAWED is warming up the decks...')}
          </div>
        </div>
      )}

      <TopBar radioName={RADIO_NAME} freq={RADIO_FREQ} connected={connected} view={view} onViewChange={(newView) => startViewTransition(() => setView(newView))} weather={weather} ttsStatus={ttsStatus} />

      {isViewTransitionPending && (
        <div style={{
          position: 'fixed', top: 24, left: '50%', transform: 'translateX(-50%)',
          fontFamily: 'var(--font-pixel)', fontSize: 8, color: 'var(--accent)',
          letterSpacing: '2px', zIndex: 100, pointerEvents: 'none',
        }}>
          <span className="cursor-blink">SWITCHING...</span>
        </div>
      )}

      {/* Player — always mounted, hidden when not active */}
      <div style={{ display: view === 'player' ? 'flex' : 'none', flexDirection: 'column', flex: 1 }}>
        <Layout
          crab={
            <CrabMascot
              state={crabState}
              onInteract={handleCrabClick}
              bubbles={bubbles}
              onBubbleClick={handleBubbleClick}
              bubblesVisible={bubblesVisible}
            />
          }
          djDialog={
            <DJDialog
              text={djDialogText}
              streaming={djDialogStreaming}
              visible={djDialogVisible}
              messageId={djDialogMsgId}
              onReply={handleDJDialogReply}
              onHide={handleDJDialogHide}
              speechAudioRef={authSpeechAudioRef}
            />
          }
          djDialogVisible={djDialogVisible}
          spectrum={<Spectrum audioElement={audioEl} isPlaying={radioState.isPlaying} theme={theme} songKey={radioState.currentSong?.id} />}
          chat={<ChatBox messages={chatMessages} onSend={handleChatMessage} isOpen={chatOpen} onToggle={setChatOpen} />}
          chatOpen={chatOpen}
          error={error}
        />
        <PlaylistList onPlay={() => {}} socket={socket} />
        <LyricsDisplay
          songId={radioState.currentSong?.id}
          song={radioState.currentSong}
          elapsed={radioState.elapsed}
          isPlaying={radioState.isPlaying}
        />
        <PlayerBar
          song={radioState.currentSong}
          isPlaying={radioState.isPlaying}
          elapsed={radioState.elapsed}
          duration={radioState.duration}
          mode={radioState.queueMode}
          upcomingSongs={radioState.upcomingSongs}
          musicAudioRef={musicAudioRef}
          onSkip={handleSkip}
          onPrevious={handlePrevious}
          onPause={handlePause}
          onResume={handleResume}
          onSetMode={handleSetMode}
          socket={socket}
        />
      </div>

      {/* Profile — lazy loaded, conditionally rendered */}
      {view === 'profile' && (
        <Suspense fallback={<ViewFallback />}>
          <ProfileView
            profileData={profileData}
            plan={plan}
            socket={socket}
            onRefreshPlan={() => {
              fetch('/api/plan/today?force=true').then(r => r.json()).then(data => {
                if (data.blocks) setPlan(data);
              }).catch(() => {});
            }}
          />
        </Suspense>
      )}

      {/* Settings — lazy loaded, conditionally rendered */}
      {view === 'settings' && (
        <Suspense fallback={<ViewFallback />}>
          <SettingsView
            queueMode={radioState.queueMode}
            onSetMode={handleSetMode}
            proactiveEnabled={proactiveEnabled}
            onProactiveToggle={handleProactiveToggle}
            theme={theme}
            override={override}
            setThemeOverride={setThemeOverride}
            clearOverride={clearOverride}
            ttsStatus={ttsStatus}
          />
        </Suspense>
      )}
    </div>
  );
}
