/**
 * Bubble generator — pure function.
 *
 * Generates personalized bubble tags from user profile, weather mood,
 * and time of day. Each bubble contains a label (display text),
 * type (genre/mood/weather), value (search key), and query (pre-computed search term).
 *
 * @module domain/curation/BubbleGenerator
 */
import { moodToQuery } from '../routing/moodToQuery.js';

// Default genre keys when profile is empty
const DEFAULT_GENRES = ['jpop', 'jazz', 'lofi', 'citypop'];
const DEFAULT_MOOD = 'chill';
const MAX_BUBBLES = 5;

/**
 * Extract top N tags from a profile dimension, sorted by weight descending.
 * @param {object} profile
 * @param {string} dimension — 'genre' | 'mood'
 * @param {number} limit
 * @returns {Array<{name: string, weight: number}>}
 */
function getTopTags(profile, dimension, limit) {
  if (!profile?.tags?.[dimension]) return [];
  return Object.entries(profile.tags[dimension])
    .map(([name, data]) => ({ name, weight: data?.weight || 0 }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit);
}

/**
 * Generate bubble tags for the crab to blow.
 *
 * @param {object|null} profile — user profile snapshot
 * @param {object|null} weatherMood — { mood, genre, label } from inferWeatherMood
 * @param {string} _timeOfDay — 'morning'|'afternoon'|'evening'|'night' (reserved)
 * @returns {Array<{id: string, label: string, type: string, value: string, query: string}>}
 */
export function generateBubbles(profile, weatherMood, _timeOfDay) {
  const bubbles = [];
  const seenValues = new Set();

  /**
   * Add a bubble if its value hasn't been seen yet.
   * @param {string} id
   * @param {string} label
   * @param {string} type — 'genre' | 'mood' | 'weather'
   * @param {string} value — search key
   * @param {string} query — pre-computed search term
   */
  function addBubble(id, label, type, value, query) {
    if (seenValues.has(value)) return;
    if (bubbles.length >= MAX_BUBBLES) return;
    seenValues.add(value);
    bubbles.push({ id, label, type, value, query });
  }

  // 1. Weather mood bubble (type: 'weather')
  if (weatherMood) {
    addBubble(
      'weather-mood',
      weatherMood.label,
      'weather',
      weatherMood.mood,
      moodToQuery(weatherMood.mood) || weatherMood.mood,
    );

    // 2. Weather genre bubble (type: 'genre')
    addBubble(
      'weather-genre',
      `${weatherMood.genre  }时光`,
      'genre',
      weatherMood.genre,
      weatherMood.genre,
    );
  }

  // 3. Profile genre tags (top 2)
  const topGenres = getTopTags(profile, 'genre', 2);
  for (const tag of topGenres) {
    addBubble(
      `profile-genre-${tag.name}`,
      tag.name,
      'genre',
      tag.name,
      tag.name,
    );
  }

  // 4. Profile mood tags (top 1)
  const topMoods = getTopTags(profile, 'mood', 1);
  for (const tag of topMoods) {
    addBubble(
      `profile-mood-${tag.name}`,
      tag.name,
      'mood',
      tag.name,
      moodToQuery(tag.name) || tag.name,
    );
  }

  // 5. Fallback defaults only when profile is empty/null
  const hasProfileData = topGenres.length > 0 || topMoods.length > 0;
  if (!hasProfileData && !weatherMood) {
    for (const genre of DEFAULT_GENRES) {
      addBubble(`default-genre-${genre}`, genre, 'genre', genre, genre);
    }
    addBubble(
      'default-mood-chill',
      'chill',
      'mood',
      DEFAULT_MOOD,
      moodToQuery(DEFAULT_MOOD) || DEFAULT_MOOD,
    );
  }

  return bubbles.slice(0, MAX_BUBBLES);
}
