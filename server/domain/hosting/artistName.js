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
  if (Array.isArray(song.ar)) return song.ar.map((a) => a.name).join(', ');
  if (song.artist) return song.artist;
  if (Array.isArray(song.artists)) return song.artists.map((a) => a.name || a).join(', ');
  return '';
}
