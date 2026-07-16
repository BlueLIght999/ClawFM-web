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
import { useRadio } from './contexts/RadioContext.jsx';
import { useChat } from './contexts/ChatContext.jsx';
import { useAudioController } from './hooks/useAudioController.js';
import { useColdStart } from './contexts/ColdStartContext.jsx';
import { useCrab } from './contexts/CrabContext.jsx';
import { useUI } from './contexts/UIContext.jsx';
import { useRadioSocketEvents } from './hooks/useRadioSocketEvents.js';
import { useChatSocketEvents } from './hooks/useChatSocketEvents.js';
import { useCrabSocketEvents } from './hooks/useCrabSocketEvents.js';
import { useSystemSocketEvents } from './hooks/useSystemSocketEvents.js';

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
  const { radioState, setRadioState, updateRadioState, skip: handleSkip, previous: handlePrevious, pause: handlePause, resume: handleResume, setMode: handleSetMode, musicAudioRef, musicRetryRef, isPlayingRef } = useRadio();
  const [djSpeechUrl, setDjSpeechUrl] = useState(null);
  const djSpeechUrlRef = useRef(null);
  const speechTypeRef = useRef('transition');
  const [audioEl, setAudioEl] = useState(null);

  const {
    chatMessages, setChatMessages, chatOpen, setChatOpen,
    djDialogText, djDialogStreaming, djDialogVisible, djDialogMsgId,
    sendMessage: handleChatMessage, hideDJDialog: handleDJDialogHide,
    showDJMessage, appendDJStreamChunk, endDJStream, addDJMessage, chatOpenRef,
  } = useChat();
  const {
    coldPhase, setColdPhase, coldPhaseRef, coldPhaseText, setColdPhaseText,
    coldOpenText, setColdOpenText, pendingSpeechRef, isColdLoading,
  } = useColdStart();
  const {
    crabState, setCrabState, crabStateRef, bubbles, setBubbles,
    bubblesVisible, setBubblesVisible, bubbleTimeoutRef,
  } = useCrab();
  const {
    view, setView, isViewTransitionPending, startViewTransition,
    profileData, setProfileData, plan, setPlan, weather,
    proactiveEnabled, toggleProactive: handleProactiveToggle,
    ttsStatus, setTtsStatus, error, setError,
  } = useUI();

  // Expose audio element for Spectrum
  useEffect(() => {
    const el = musicAudioRef.current;
    if (el) {
      el.crossOrigin = 'anonymous';
      setAudioEl(el);
    }
  }, [loggedIn]);

  // Audio playback controller (loads audio, syncs play/pause, pauses on disconnect)
  useAudioController({
    audioRef: musicAudioRef,
    audioUrl: radioState.audioUrl,
    isPlaying: radioState.isPlaying,
    loggedIn,
    connected,
  });

  // Pause speech audio when socket disconnects (server down / killed)
  useEffect(() => {
    if (connected) return;
    const speech = authSpeechAudioRef.current;
    if (speech) { speech.pause(); }
  }, [connected, authSpeechAudioRef]);

  // Socket event listeners — split by domain
  const { pendingSongChangeRef } = useRadioSocketEvents(socket, djSpeechUrlRef);
  useChatSocketEvents(socket, djSpeechUrlRef, speechTypeRef, setDjSpeechUrl, pendingSpeechRef);
  useCrabSocketEvents(socket);
  useSystemSocketEvents(socket);

  // DJ speech playback — uses pendingSongChangeRef from useRadioSocketEvents
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
        updateRadioState(pending);
      }
    },
  });

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
  }, [setChatOpen]);
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
