import { useState, useEffect, useCallback, useRef } from 'react';
import { useSocket } from './hooks/useSocket.js';
import { useTheme } from './theme/useTheme.js';
import { THEME_NAMES } from './theme/themes.js';
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
import DJSchedule from './components/DJSchedule.jsx';

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

export default function App() {
  const { socket, connected } = useSocket();
  const { theme, override, setThemeOverride, clearOverride } = useTheme();
  const [loggedIn, setLoggedIn] = useState(false);
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
  const [chatMessages, setChatMessages] = useState([]);
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
  const speechAudioRef = useRef(null);
  const speechTypeRef = useRef('transition');
  const [audioEl, setAudioEl] = useState(null);

  const [chatOpen, setChatOpen] = useState(false);
  const [view, setView] = useState('player');
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
    const speech = speechAudioRef.current;
    if (music) { music.pause(); }
    if (speech) { speech.pause(); }
  }, [connected]);

  // DJ speech
  useEffect(() => {
    if (!djSpeechUrl || !speechAudioRef.current) return;
    // Chat is text-only — never pause music for chat speech (safety guard)
    if (speechTypeRef.current === 'chat') {
      setDjSpeechUrl(null);
      return;
    }
    const curType = speechTypeRef.current;
    const isAnnounce = curType === 'chat-announce' || curType === 'proactive';

    const music = musicAudioRef.current;
    const prevVolume = music?.volume;
    if (music) {
      if (curType === 'proactive') {
        music.volume = 0.1; // Proactive: barely audible music
      } else if (isAnnounce) {
        music.volume = 0.2; // Chat announce: quiet music
      } else {
        music.pause();
      }
    }

    const speech = speechAudioRef.current;
    // Preload before playing — fixes gap between music pause and speech start (Bug 4)
    const preloadAndPlay = () => {
      speech.src = djSpeechUrl;
      // Set DJ voice volume per type
      if (curType === 'proactive') speech.volume = 0.6;
      else if (curType === 'chat-announce') speech.volume = 0.85;
      else speech.volume = 1.0;

      let resolved = false;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        setDjSpeechUrl(null);
        djSpeechUrlRef.current = null;
        if (music && isAnnounce && prevVolume !== undefined) {
          music.volume = prevVolume;
        }
        if (socket) socket.emit('dj-speech-finished', { type: curType });
        if (music && !isAnnounce && radioState.isPlaying) {
          music.play().catch(() => {});
        }
        // Apply deferred song change if one was waiting
        if (pendingSongChangeRef.current) {
          const pending = pendingSongChangeRef.current;
          pendingSongChangeRef.current = null;
          setRadioState(prev => ({ ...prev, ...pending }));
        }
      };

      speech.onended = finish;
      speech.onerror = () => {
        // Retry once with reload (not just replay)
        if (resolved) return;
        speech.load();
        setTimeout(() => {
          if (resolved) return;
          speech.play().catch(() => { finish(); });
        }, 800);
      };

      // Wait for audio to be loadable, then play (Bug 4: preload)
      const doPlay = () => {
        speech.play().then(() => {
          // Success — speech playing
        }).catch(() => {
          // Autoplay blocked — immediately finish, don't wait 8s (Bug 3)
          finish();
        });
      };

      const loadTimeout = setTimeout(() => {
        // Load took too long — attempt play anyway
        doPlay();
      }, 2000);

      speech.addEventListener('canplay', () => {
        clearTimeout(loadTimeout);
        doPlay();
      }, { once: true });

      // Start loading
      speech.load();
    };

    preloadAndPlay();

    // Safety: force-finish if speech hangs (shorter for cold-start to unblock loading screen)
    const safety = setTimeout(() => {
      if (speech && !speech.ended && !speech.paused) return; // still playing
      setDjSpeechUrl(null);
      djSpeechUrlRef.current = null;
      if (music && isAnnounce && prevVolume !== undefined) {
        music.volume = prevVolume;
      }
      if (socket) socket.emit('dj-speech-finished', { type: curType });
      if (music && !isAnnounce && radioState.isPlaying) {
        music.play().catch(() => {});
      }
      // Apply deferred song change if one was waiting
      if (pendingSongChangeRef.current) {
        const pending = pendingSongChangeRef.current;
        pendingSongChangeRef.current = null;
        setRadioState(prev => ({ ...prev, ...pending }));
      }
    }, curType === 'cold-start' ? 15000 : 30000);
    return () => {
      clearTimeout(safety);
    };
  }, [djSpeechUrl]);

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
    });
    socket.on(E.DJ_STREAM_END, () => {});
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
    fetch('/api/auth/status').then(r => r.json()).then(data => setLoggedIn(data.loggedIn)).catch(() => {});
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
  const handleLoginPhone = useCallback((phone, password) => {
    // Unlock audio for autoplay — this runs during a user click gesture
    if (speechAudioRef.current) speechAudioRef.current.play().catch(() => {});
    if (socket) socket.emit('auth:login-phone', { phone, password });
  }, [socket]);
  const handleLoginQr = useCallback(() => {
    // Unlock audio for autoplay — this runs during a user click gesture
    if (speechAudioRef.current) speechAudioRef.current.play().catch(() => {});
    if (socket) socket.emit('auth:login-qr-start');
  }, [socket]);
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
      <audio ref={speechAudioRef} preload="auto" />

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

      <TopBar radioName={RADIO_NAME} freq={RADIO_FREQ} connected={connected} view={view} onViewChange={setView} weather={weather} ttsStatus={ttsStatus} />

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

      {/* Profile — always mounted, hidden when not active */}
      <div style={{ display: view === 'profile' ? 'block' : 'none', flex: 1, overflow: 'auto', padding: 10 }}>
        <h2 className="pixel-title" style={{ marginBottom: 10, fontSize: 12 }}>PROFILE & SCHEDULE</h2>
        <div className="pixel-border" style={{
          background: 'var(--bg-secondary)', padding: '8px 12px', marginBottom: 8,
        }}>
          {profileData ? (
            <div style={{ display: 'flex', gap: 20, fontFamily: 'var(--font-mono)', fontSize: 16 }}>
              <div>
                <span style={{ color: 'var(--text-dim)' }}>Mood: </span>
                <span style={{ color: 'var(--accent-glow)' }}>{profileData.currentMood}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-dim)' }}>Songs played: </span>
                <span style={{ color: 'var(--text-primary)' }}>{profileData.totalSongs || 0}</span>
              </div>
              {profileData.topArtists?.length > 0 && (
                <div style={{ flex: 1 }}>
                  <span style={{ color: 'var(--text-dim)' }}>Top: </span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {profileData.topArtists.slice(0, 5).map(a => a.name).join(', ')}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--text-dim)' }}>Loading taste data...</p>
          )}
        </div>
        <DJSchedule plan={plan} socket={socket} activeBlockIndex={plan?.activeBlockIndex} onRefresh={() => {
          fetch('/api/plan/today?force=true').then(r => r.json()).then(data => {
            if (data.blocks) setPlan(data);
          }).catch(() => {});
        }} />
      </div>

      {/* Settings — always mounted, hidden when not active */}
      <div style={{ display: view === 'settings' ? 'block' : 'none', flex: 1, overflow: 'auto', padding: 10 }}>
        <h2 className="pixel-title" style={{ marginBottom: 8, fontSize: 12 }}>SETTINGS</h2>
        <div className="pixel-border" style={{ background: 'var(--bg-secondary)', padding: '8px 12px', marginBottom: 8 }}>
          <p style={{ fontFamily: 'var(--font-pixel)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 6 }}>QUEUE MODE</p>
          <div style={{ display: 'flex', gap: 4 }}>
            {['sequential', 'shuffle', 'fm'].map(m => (
              <button key={m} className={`pixel-btn ${radioState.queueMode === m ? 'accent' : ''}`}
                onClick={() => handleSetMode(m)} style={{ fontSize: 9 }}>{m.toUpperCase()}</button>
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
              onClick={handleProactiveToggle}
              style={{ fontSize: 9, minWidth: 50 }}
            >{proactiveEnabled ? 'ON' : 'OFF'}</button>
          </div>
        </div>
        <div className="pixel-border" style={{ background: 'var(--bg-secondary)', padding: '8px 12px', marginBottom: 8 }}>
          <p style={{ fontFamily: 'var(--font-pixel)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 6 }}>THEME</p>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
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
    </div>
  );
}
