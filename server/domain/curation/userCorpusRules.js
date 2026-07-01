/**
 * Pure user-corpus rules — template detection predicates and routines builder.
 * Extracted from recommender._writeUserCorpus so the fs read/write can move
 * behind a CorpusPort while these decisions stay unit-testable (no IO).
 */

/**
 * taste.md is still a template if it has no non-empty markdown list item.
 * Matches recommender: !/^-\s*\S/m.test(content)
 */
export function isTasteTemplate(content) {
  return !/^-\s*\S/m.test(content);
}

/**
 * routines.md needs genre-filling if it has content but no "Genre: <value>".
 * Matches recommender: existing && !/Genre: \S/.test(existing)
 */
export function isRoutinesTemplate(content) {
  return !!content && !/Genre: \S/.test(content);
}

/**
 * Build routines.md content; evening genre seeded from top artist names.
 * @param {string[]} topArtistNames
 */
export function buildRoutinesMarkdown(topArtistNames = []) {
  const eveningGenre = topArtistNames.slice(0, 3).join(', ') || 'indie, electronic, jazz';
  return `# Daily Routines

## Morning (06:00 - 10:00)
Mood: energetic but gentle
Genre: pop, acoustic, indie folk

## Daytime (10:00 - 17:00)
Mood: focused, neutral
Genre: instrumental, ambient, post-rock

## Evening (17:00 - 22:00)
Mood: warm, engaged
Genre: ${eveningGenre}

## Late Night (22:00 - 06:00)
Mood: intimate, chill
Genre: ambient, lo-fi, dream pop

## Weekend
Mood: relaxed, exploratory
Genre: mix of favorites + new discoveries
`;
}
