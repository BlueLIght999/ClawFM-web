import { useTheme } from './theme/useTheme.js';
import { useAuth } from './contexts/AuthContext.jsx';
import { RADIO_NAME, RADIO_FREQ } from './config.js';
import TopBar from './components/TopBar.jsx';
import { ColdStartOverlay } from './components/ColdStartOverlay.jsx';
import { LoginGate } from './components/LoginGate.jsx';
import { PlayerView } from './components/PlayerView.jsx';
import { ViewRouter } from './components/ViewRouter.jsx';
import { useRadio } from './contexts/RadioContext.jsx';
import { useChat } from './contexts/ChatContext.jsx';
import { useAudioController } from './hooks/useAudioController.js';
import { useColdStart } from './contexts/ColdStartContext.jsx';
import { useCrab } from './contexts/CrabContext.jsx';
import { useUI } from './contexts/UIContext.jsx';
import { useCrabSocketEvents } from './hooks/useCrabSocketEvents.js';
import { useSystemSocketEvents } from './hooks/useSystemSocketEvents.js';
import { useAudioErrorHandler } from './hooks/useAudioErrorHandler.js';
import { useGeolocation } from './hooks/useGeolocation.js';
import { useCrabInteraction } from './hooks/useCrabInteraction.js';
import { useAudioExpose } from './hooks/useAudioExpose.js';
import { useDjSpeech } from './hooks/useDjSpeech.js';

export default function App({ socket, connected }) {
  const { theme, override, setThemeOverride, clearOverride } = useTheme();
  const { loggedIn, setLoggedIn, loginPhone: handleLoginPhone, loginQr: handleLoginQr, speechAudioRef: authSpeechAudioRef } = useAuth();
  const { radioState, setRadioState, updateRadioState, skip: handleSkip, previous: handlePrevious, pause: handlePause, resume: handleResume, setMode: handleSetMode, musicAudioRef, musicRetryRef, isPlayingRef } = useRadio();

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

  // Expose audio element for Spectrum + pause speech on disconnect
  const { audioEl } = useAudioExpose({ musicAudioRef, speechAudioRef: authSpeechAudioRef, loggedIn, connected });

  // Audio playback controller (loads audio, syncs play/pause, pauses on disconnect)
  useAudioController({
    audioRef: musicAudioRef,
    audioUrl: radioState.audioUrl,
    isPlaying: radioState.isPlaying,
    loggedIn,
    connected,
  });

  // Audio error handler (retries on error, skips after 2 failures)
  const handleAudioError = useAudioErrorHandler({
    audioRef: musicAudioRef,
    audioUrl: radioState.audioUrl,
    connected,
    socket,
    retryRef: musicRetryRef,
  });

  // DJ speech: URL state + refs + socket events + playback (consolidated)
  const { setDjSpeechUrl } = useDjSpeech({
    socket,
    musicAudioRef,
    speechAudioRef: authSpeechAudioRef,
    isPlaying: radioState.isPlaying,
    updateRadioState,
    pendingSpeechRef,
  });

  useCrabSocketEvents(socket);
  useSystemSocketEvents(socket);

  // Send browser geolocation to server for accurate weather
  useGeolocation(socket, connected);

  // Crab interaction handlers (click, bubble, DJ dialog reply, deferred speech)
  const { handleCrabClick, handleBubbleClick, handleDJDialogReply } = useCrabInteraction({ socket, setDjSpeechUrl });

  if (!loggedIn) {
    return (
      <LoginGate
        connected={connected}
        socket={socket}
        error={error}
        onPhoneLogin={handleLoginPhone}
        onQrLogin={handleLoginQr}
      />
    );
  }

  return (
    <div className="app-container" style={{ background: 'var(--bg-primary)', minHeight: '100vh' }}>
      <audio ref={musicAudioRef} preload="auto" crossOrigin="anonymous"
        onEnded={() => { if (socket) socket.emit('player:ended'); }}
        onError={handleAudioError}
      />
      <audio ref={authSpeechAudioRef} preload="auto" />

      {/* Cold-start loading overlay */}
      <ColdStartOverlay
        isColdLoading={isColdLoading}
        coldPhase={coldPhase}
        coldPhaseText={coldPhaseText}
        coldOpenText={coldOpenText}
      />

      <TopBar radioName={RADIO_NAME} freq={RADIO_FREQ} connected={connected} view={view} onViewChange={(newView) => startViewTransition(() => setView(newView))} weather={weather} ttsStatus={ttsStatus} />

      {/* Player — always mounted, hidden when not active */}
      <PlayerView
        visible={view === 'player'}
        crabState={crabState}
        onCrabClick={handleCrabClick}
        bubbles={bubbles}
        onBubbleClick={handleBubbleClick}
        bubblesVisible={bubblesVisible}
        djDialogText={djDialogText}
        djDialogStreaming={djDialogStreaming}
        djDialogVisible={djDialogVisible}
        djDialogMsgId={djDialogMsgId}
        onDJDialogReply={handleDJDialogReply}
        onDJDialogHide={handleDJDialogHide}
        speechAudioRef={authSpeechAudioRef}
        audioEl={audioEl}
        isPlaying={radioState.isPlaying}
        theme={theme}
        chatMessages={chatMessages}
        onChatMessage={handleChatMessage}
        chatOpen={chatOpen}
        setChatOpen={setChatOpen}
        error={error}
        socket={socket}
        currentSong={radioState.currentSong}
        elapsed={radioState.elapsed}
        duration={radioState.duration}
        queueMode={radioState.queueMode}
        upcomingSongs={radioState.upcomingSongs}
        musicAudioRef={musicAudioRef}
        onSkip={handleSkip}
        onPrevious={handlePrevious}
        onPause={handlePause}
        onResume={handleResume}
        onSetMode={handleSetMode}
        weather={weather}
      />

      <ViewRouter
        view={view}
        isViewTransitionPending={isViewTransitionPending}
        profileData={profileData}
        plan={plan}
        socket={socket}
        radioState={radioState}
        theme={theme}
        override={override}
        setThemeOverride={setThemeOverride}
        clearOverride={clearOverride}
        proactiveEnabled={proactiveEnabled}
        onProactiveToggle={handleProactiveToggle}
        onSetMode={handleSetMode}
        ttsStatus={ttsStatus}
        setPlan={setPlan}
      />
    </div>
  );
}
