/**
 * Named-region shell for the Agent Radio FM screen.
 * Business state remains outside this component; it only owns responsive composition.
 */
export function AgentRadioShell({
  nowPlaying, spectrum, agent, lyrics, player,
  taste, playlists, upNext, error,
}) {
  return (
    <main className="agent-radio-shell" data-testid="agent-radio-main">
      {error && <div className="agent-radio-error" role="alert">ERR: {error}</div>}
      <div className="agent-radio-grid">
        <section className="agent-radio-left" aria-label="FM player">
          <Region name="now-playing">{nowPlaying}</Region>
          <Region name="spectrum">{spectrum}</Region>
          <Region name="agent">{agent}</Region>
          <div className="agent-radio-bottom">
            <Region name="lyrics">{lyrics}</Region>
            <Region name="player">{player}</Region>
          </div>
        </section>
        <aside className="agent-radio-sidebar" data-testid="agent-radio-sidebar" aria-label="Radio sidebar">
          <Region name="taste">{taste}</Region>
          <Region name="playlists">{playlists}</Region>
          <Region name="up-next">{upNext}</Region>
        </aside>
      </div>
    </main>
  );
}

function Region({ name, children }) {
  return (
    <div className={`agent-radio-region agent-radio-region-${name}`}
      data-testid={`agent-radio-region-${name}`} data-region={name}>
      {children}
    </div>
  );
}
