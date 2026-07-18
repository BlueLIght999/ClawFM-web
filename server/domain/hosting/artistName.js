/**
 * Pure artist-name resolver — unifies the several song-object shapes
 * (NetEase `ar[]`, plain `artist`, `artists[]`) into a comma-joined string.
 *
 * Extracted from claude.js getArtistStr. No IO. This is a seed for the future
 * MusicSourcePort DTO mapping that will stop `ar/al/dt` leaking to the frontend.
 *
 * Priority: ar[] > artist(string) > artists[] > ''.
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
