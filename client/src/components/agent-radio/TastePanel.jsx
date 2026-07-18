const MAX_TAGS = 8;

/** Renders durable taste/profile data, separate from transient crab interaction bubbles. */
export function TastePanel({ data, loading = false, error = null, weather = '' }) {
  if (loading) return <PanelState text="TUNING PROFILE..." />;
  if (error) return <PanelState text="PROFILE OFFLINE" />;

  const tags = buildTags(data, weather);
  return (
    <section className="radio-sidebar-section taste-panel" aria-labelledby="taste-title">
      <h2 className="radio-sidebar-title" id="taste-title">YOUR TASTE</h2>
      {tags.length === 0 ? (
        <p className="radio-sidebar-empty">LISTEN MORE TO SHAPE YOUR TASTE</p>
      ) : (
        <div className="taste-tag-grid">
          {tags.map((tag) => <span className={`taste-tag taste-tag-${tag.kind}`} key={`${tag.kind}:${tag.label}`}>{tag.label}</span>)}
        </div>
      )}
    </section>
  );
}

function PanelState({ text }) {
  return (
    <section className="radio-sidebar-section taste-panel" aria-labelledby="taste-title">
      <h2 className="radio-sidebar-title" id="taste-title">YOUR TASTE</h2>
      <p className="radio-sidebar-empty">{text}</p>
    </section>
  );
}

function buildTags(data, weather) {
  const genres = normalizeLabels(data?.topGenres).map(label => ({ label, kind: 'genre' }));
  const artists = normalizeLabels(data?.topArtists).map(label => ({ label, kind: 'artist' }));
  const context = [data?.currentMood, weather]
    .filter(Boolean)
    .map(label => ({ label, kind: 'context' }));
  return [...genres, ...artists, ...context].slice(0, MAX_TAGS);
}

function normalizeLabels(items) {
  if (!Array.isArray(items)) return [];
  return items.map(item => typeof item === 'string' ? item : item?.name).filter(Boolean);
}
