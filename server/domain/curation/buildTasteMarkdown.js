/**
 * Pure taste.md content builder — no fs, no Date side-effect (date passed in).
 * Extracted from recommender._writeUserCorpus so the markdown generation is
 * unit-testable and the fs read/write stays isolated in the caller.
 *
 * @param {Object} p
 * @param {Array<{name:string,count:number}>} p.topArtists
 * @param {Array<{name?:string}|string>} p.topGenres
 * @param {number} p.totalSongs
 * @param {string} p.date  ISO date (YYYY-MM-DD), passed in to keep function pure
 * @returns {string} taste.md markdown content
 */
export function buildTasteMarkdown({ topArtists = [], topGenres = [], totalSongs = 0, date = '' } = {}) {
  const top10 = topArtists.slice(0, 10).map((a) => `- ${a.name} (${a.count} plays)`).join('\n');
  const top5Names = topArtists.slice(0, 5).map((a) => a.name).join(', ');
  const genres =
    topGenres.length > 0
      ? topGenres.slice(0, 5).map((g) => `- ${g.name || g}`).join('\n')
      : '- (auto-detected from listening)';

  return `# User Taste Profile

## Favorite Artists
<!-- Auto-generated from listening history: ${totalSongs} songs analyzed -->
${top10}

## Favorite Genres
${genres}

## Languages
- Chinese, English, instrumental

## Notes
- Top artists: ${top5Names}
- Auto-generated ${date}. Edit freely to tune the DJ.
`;
}
