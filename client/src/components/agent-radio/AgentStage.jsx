/** Layout-only stage for the crab, transient DJ dialog, and persistent chat panel. */
export function AgentStage({ crab, dialog, chat, chatOpen = false }) {
  return (
    <section className={`agent-stage${chatOpen ? ' is-chat-open' : ''}`} data-testid="agent-stage" aria-label="AI DJ">
      <div className="agent-stage-mascot">
        {crab}
        {dialog}
      </div>
      <div className="agent-stage-chat">{chat}</div>
    </section>
  );
}
