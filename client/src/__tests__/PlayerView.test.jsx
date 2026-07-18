import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlayerView } from '../components/PlayerView.jsx';

vi.mock('../components/agent-radio/AgentRadioShell.jsx', () => ({
  AgentRadioShell: ({ nowPlaying, spectrum, agent, lyrics, player, taste, playlists, upNext, error }) => (
    <div data-testid="agent-radio-shell" data-error={String(error ?? '')}>
      {nowPlaying}{spectrum}{agent}{lyrics}{player}{taste}{playlists}{upNext}
    </div>
  ),
}));
vi.mock('../components/agent-radio/AgentStage.jsx', () => ({
  AgentStage: ({ crab, dialog, chat }) => <div data-testid="agent-stage">{crab}{dialog}{chat}</div>,
}));
vi.mock('../components/agent-radio/NowPlayingPanel.jsx', () => ({
  NowPlayingPanel: ({ song }) => <div data-testid="now-playing">{song?.title}</div>,
}));
vi.mock('../components/agent-radio/TastePanel.jsx', () => ({
  TastePanel: ({ data, weather }) => <div data-testid="taste-panel">{data?.currentMood}:{weather}</div>,
}));
vi.mock('../components/agent-radio/UpNextPanel.jsx', () => ({
  UpNextPanel: ({ songs }) => <div data-testid="up-next-panel">{songs.length}</div>,
}));
vi.mock('../hooks/useTasteSummary.js', () => ({
  useTasteSummary: () => ({ data: { currentMood: 'calm' }, loading: false, error: null, refresh: vi.fn() }),
}));
vi.mock('../components/CrabMascot.jsx', () => ({
  default: ({ state, onInteract, bubbles, onBubbleClick, bubblesVisible }) => (
    <div data-testid="crab" data-state={state} data-bubbles-visible={String(bubblesVisible)} />
  ),
}));
vi.mock('../components/DJDialog.jsx', () => ({
  default: ({ text, streaming, visible, onReply, onHide }) => (
    <div data-testid="dj-dialog" data-visible={String(visible)} data-streaming={String(streaming)}>{text}</div>
  ),
}));
vi.mock('../components/Spectrum.jsx', () => ({
  default: ({ audioElement, isPlaying, theme }) => (
    <div data-testid="spectrum" data-playing={String(isPlaying)} data-theme={theme} />
  ),
}));
vi.mock('../components/ChatBox.jsx', () => ({
  default: ({ messages, onSend, isOpen }) => (
    <div data-testid="chat-box" data-open={String(isOpen)}>{messages.length} msgs</div>
  ),
}));
vi.mock('../components/PlaylistList.jsx', () => ({
  default: ({ socket }) => (
    <div data-testid="playlist-list" data-has-socket={String(!!socket)} />
  ),
}));
vi.mock('../components/LyricsDisplay.jsx', () => ({
  default: ({ songId, song, elapsed, isPlaying }) => (
    <div data-testid="lyrics" data-song-id={String(songId)} data-elapsed={String(elapsed)} />
  ),
}));
vi.mock('../components/PlayerBar.jsx', () => ({
  default: ({ song, isPlaying, elapsed, duration, mode, showInlineQueue }) => (
    <div data-testid="player-bar" data-playing={String(isPlaying)} data-mode={mode}
      data-elapsed={String(elapsed)} data-inline-queue={String(showInlineQueue)} />
  ),
}));

describe('PlayerView', () => {
  const defaultProps = {
    visible: true,
    crabState: 'idle',
    onCrabClick: vi.fn(),
    bubbles: [],
    onBubbleClick: vi.fn(),
    bubblesVisible: false,
    djDialogText: 'Hello',
    djDialogStreaming: false,
    djDialogVisible: false,
    djDialogMsgId: 'msg1',
    onDJDialogReply: vi.fn(),
    onDJDialogHide: vi.fn(),
    speechAudioRef: { current: null },
    audioEl: null,
    isPlaying: false,
    theme: 'dark',
    chatMessages: [],
    onChatMessage: vi.fn(),
    chatOpen: false,
    setChatOpen: vi.fn(),
    error: null,
    socket: { emit: vi.fn() },
    currentSong: { id: 'song1' },
    elapsed: 30,
    duration: 180,
    queueMode: 'normal',
    upcomingSongs: [],
    musicAudioRef: { current: null },
    onSkip: vi.fn(),
    onPrevious: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onSetMode: vi.fn(),
    weather: 'Clear 28C',
  };

  it('rendersAllChildComponents_whenVisible', () => {
    render(<PlayerView {...defaultProps} />);
    expect(screen.getByTestId('agent-radio-shell')).toBeInTheDocument();
    expect(screen.getByTestId('playlist-list')).toBeInTheDocument();
    expect(screen.getByTestId('lyrics')).toBeInTheDocument();
    expect(screen.getByTestId('player-bar')).toBeInTheDocument();
  });

  it('hidesContent_whenNotVisible', () => {
    const { container } = render(<PlayerView {...defaultProps} visible={false} />);
    const playerDiv = container.firstChild;
    expect(playerDiv.style.display).toBe('none');
  });

  it('showsContent_whenVisible', () => {
    const { container } = render(<PlayerView {...defaultProps} visible={true} />);
    const playerDiv = container.firstChild;
    expect(playerDiv.style.display).toBe('flex');
  });

  it('passesErrorToLayout', () => {
    render(<PlayerView {...defaultProps} error="Something broke" />);
    expect(screen.getByTestId('agent-radio-shell').dataset.error).toBe('Something broke');
  });

  it('passesCrabStateToCrabMascot', () => {
    render(<PlayerView {...defaultProps} crabState="listening" />);
    expect(screen.getByTestId('crab').dataset.state).toBe('listening');
  });

  it('passesSongIdToLyrics', () => {
    render(<PlayerView {...defaultProps} currentSong={{ id: 'abc123' }} elapsed={42} />);
    expect(screen.getByTestId('lyrics').dataset.songId).toBe('abc123');
    expect(screen.getByTestId('lyrics').dataset.elapsed).toBe('42');
  });

  it('passesPlaybackStateToPlayerBar', () => {
    render(<PlayerView {...defaultProps} isPlaying={true} elapsed={50} duration={200} queueMode="shuffle" />);
    const bar = screen.getByTestId('player-bar');
    expect(bar.dataset.playing).toBe('true');
    expect(bar.dataset.elapsed).toBe('50');
    expect(bar.dataset.mode).toBe('shuffle');
  });

  it('passesSocketToPlaylistList', () => {
    render(<PlayerView {...defaultProps} socket={{ emit: vi.fn() }} />);
    expect(screen.getByTestId('playlist-list').dataset.hasSocket).toBe('true');
  });

  it('rendersDJDialogText', () => {
    render(<PlayerView {...defaultProps} djDialogText="DJ says hi" djDialogVisible={true} />);
    expect(screen.getByTestId('dj-dialog').textContent).toBe('DJ says hi');
    expect(screen.getByTestId('dj-dialog').dataset.visible).toBe('true');
  });

  it('rendersTasteAndUpNextInSidebar', () => {
    render(<PlayerView {...defaultProps} upcomingSongs={[{ id: 'next-1', title: 'Next' }]} />);
    expect(screen.getByTestId('taste-panel')).toHaveTextContent('calm:Clear 28C');
    expect(screen.getByTestId('up-next-panel')).toHaveTextContent('1');
  });

  it('disablesPlayerBarInlineQueue', () => {
    render(<PlayerView {...defaultProps} />);
    expect(screen.getByTestId('player-bar').dataset.inlineQueue).toBe('false');
  });
});
