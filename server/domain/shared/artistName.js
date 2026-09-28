/**
 * Pure artist-name resolver — unifies the several song-object shapes
 * (NetEase `ar[]`, plain `artist`, `artists[]`) into a comma-joined string.
 *
 * Shared kernel: this is a shape adapter over the *music-source* song object,
 * not a rule of hosting, curation or playback. It lives here rather than in a
 * bounded context because 4+ contexts need it, and any context owning it would
 * force the others to import across a boundary (D10).
 *
 * Priority: ar[] > artist(string) > artists[] > ''.
 *
 * @param {object|null} song
 * @returns {string}
 */
export function artistName(song) {
  if (!song) return '';
  const modernArtists = joinArtistNames(song.ar);
  if (modernArtists) return modernArtists;
  if (typeof song.artist === 'string') return song.artist;
  if (typeof song.artist?.name === 'string') return song.artist.name;
  const legacyArtists = joinArtistNames(song.artists);
  if (legacyArtists) return legacyArtists;
  return '';
}

function joinArtistNames(artists) {
  if (!Array.isArray(artists)) return '';
  return artists
    .map(artist => typeof artist === 'string' ? artist : artist?.name)
    .filter(name => typeof name === 'string' && name.length > 0)
    .join(', ');
}
