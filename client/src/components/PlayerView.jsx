import CrabMascot from './CrabMascot.jsx';
import DJDialog from './DJDialog.jsx';
import Spectrum from './Spectrum.jsx';
import ChatBox from './ChatBox.jsx';
import PlaylistList from './PlaylistList.jsx';
import LyricsDisplay from './LyricsDisplay.jsx';
import PlayerBar from './PlayerBar.jsx';
import { AgentRadioShell } from './agent-radio/AgentRadioShell.jsx';
import { AgentStage } from './agent-radio/AgentStage.jsx';
import { NowPlayingPanel } from './agent-radio/NowPlayingPanel.jsx';
import { TastePanel } from './agent-radio/TastePanel.jsx';
import { UpNextPanel } from './agent-radio/UpNextPanel.jsx';
import { useTasteSummary } from '../hooks/useTasteSummary.js';
import './agent-radio/agent-radio.css';

export function PlayerView({
  visible,
  crabState, onCrabClick, bubbles, onBubbleClick, bubblesVisible,
  djDialogText, djDialogStreaming, djDialogVisible, djDialogMsgId,
  onDJDialogReply, onDJDialogHide, speechAudioRef,
  audioEl, isPlaying, theme,
  chatMessages, onChatMessage, chatOpen, setChatOpen,
  error, socket, weather = '',
  currentSong, elapsed, duration, queueMode, upcomingSongs,
  musicAudioRef, onSkip, onPrevious, onPause, onResume, onSetMode,
}) {
  const taste = useTasteSummary();
  const selectUpcomingSong = (index) => socket?.emit('player:skip-to-index', { index });

  return (
    <div className="agent-radio-view" style={{ display: visible ? 'flex' : 'none' }}>
      <AgentRadioShell
        error={error}
        nowPlaying={
          <NowPlayingPanel song={currentSong} isPlaying={isPlaying}
            onPrevious={onPrevious} onPause={onPause} onResume={onResume} onSkip={onSkip} />
        }
        spectrum={<Spectrum audioElement={audioEl} isPlaying={isPlaying} theme={theme} songKey={currentSong?.id} />}
        agent={
          <AgentStage
            chatOpen={chatOpen}
            crab={
              <CrabMascot state={crabState} onInteract={onCrabClick} bubbles={bubbles}
                onBubbleClick={onBubbleClick} bubblesVisible={bubblesVisible} />
            }
            dialog={
              <DJDialog text={djDialogText} streaming={djDialogStreaming} visible={djDialogVisible}
                messageId={djDialogMsgId} onReply={onDJDialogReply} onHide={onDJDialogHide}
                speechAudioRef={speechAudioRef} />
            }
            chat={<ChatBox messages={chatMessages} onSend={onChatMessage} isOpen={chatOpen} onToggle={setChatOpen} />}
          />
        }
        lyrics={<LyricsDisplay songId={currentSong?.id} song={currentSong} elapsed={elapsed} isPlaying={isPlaying} />}
        player={
          <PlayerBar song={currentSong} isPlaying={isPlaying} elapsed={elapsed} duration={duration}
            mode={queueMode} upcomingSongs={upcomingSongs} musicAudioRef={musicAudioRef}
            onSkip={onSkip} onPrevious={onPrevious} onPause={onPause} onResume={onResume}
            onSetMode={onSetMode} socket={socket} showInlineQueue={false} />
        }
        taste={<TastePanel data={taste.data} loading={taste.loading} error={taste.error} weather={weather} />}
        playlists={<PlaylistList onPlay={() => {}} socket={socket} variant="sidebar" defaultExpanded />}
        upNext={<UpNextPanel songs={upcomingSongs} onSelect={selectUpcomingSong} />}
      />
    </div>
  );
}
