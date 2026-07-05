function artistName(artist) {
  if (typeof artist === 'string') return artist;
  return artist?.name || '';
}

export function topArtistNames(profile, limit = 5, fallback = 'unknown') {
  const names = (profile?.topArtists || [])
    .slice(0, limit)
    .map(artistName)
    .filter(Boolean);
  return names.join(', ') || fallback;
}

export function firstTopArtistQuery(profile, preference, fallback = '热门') {
  if (preference) return preference;
  return artistName(profile?.topArtists?.[0]) || fallback;
}
