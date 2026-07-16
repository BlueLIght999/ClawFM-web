/**
 * Bubble event handler — wires crab bubble click events and
 * periodic bubble push to the socket layer.
 *
 * @module socket/bubbleHandler
 */
import { EVENTS } from './events.js';
import { generateBubbles } from '../domain/curation/BubbleGenerator.js';
import { inferWeatherMood } from '../domain/environment/weatherMood.js';
import { isGenreQuery } from '../domain/routing/isGenreQuery.js';
import { createGenreSearchEngine } from '../domain/routing/GenreSearchEngine.js';
import { moodToQuery } from '../domain/routing/moodToQuery.js';
import { getTimeOfDayMood } from '../domain/hosting/getTimeOfDayMood.js';

const BUBBLE_PUSH_INTERVAL_MS = 90 * 1000; // 90 seconds
const BUBBLE_SONG_CHANGE_PROBABILITY = 0.55; // 55% chance on each song change

/**
 * Get the current time of day as a string.
 * @returns {'morning'|'afternoon'|'evening'|'night'}
 */
function currentTimeOfDay() {
  return getTimeOfDayMood();
}

/**
 * Generate and push bubbles to all clients.
 * @param {object} io — socket.io server
 * @param {object} deps — { profileOrchestrator, getWeatherRaw }
 */
export async function pushBubbles(io, deps) {
  try {
    const { profileOrchestrator, getWeatherRaw } = deps;
    const timeOfDay = currentTimeOfDay();

    // Get profile snapshot
    let profile = null;
    if (profileOrchestrator?.getLatestSnapshot) {
      profile = profileOrchestrator.getLatestSnapshot();
    }

    // Get weather data
    let weatherMood = null;
    if (getWeatherRaw) {
      const raw = await getWeatherRaw();
      if (raw) {
        weatherMood = inferWeatherMood(raw.code, raw.temp, timeOfDay);
      }
    }

    const bubbles = generateBubbles(profile, weatherMood, timeOfDay);
    if (bubbles.length > 0) {
      io.emit(EVENTS.CRAB_BUBBLES, { bubbles });
    }
  } catch (e) {
    console.error('[Bubbles] push failed:', e.message);
  }
}

/**
 * Probabilistically push bubbles (used on song-change events).
 * @param {object} io — socket.io server
 * @param {object} deps — dependencies
 * @param {number} probability — chance to push (0-1)
 */
export async function maybePushBubbles(io, deps, probability = BUBBLE_SONG_CHANGE_PROBABILITY) {
  if (Math.random() < probability) {
    await pushBubbles(io, deps);
  }
}

/**
 * Search for songs based on a bubble tag.
 * @param {object} tag — { type, value, query, label }
 * @param {object} music — MusicSourcePort
 * @returns {Promise<Array>} songs
 */
async function searchByBubbleTag(tag, music) {
  const { type, query } = tag;

  // Genre tags use GenreSearchEngine for multi-source search
  if (type === 'genre' && isGenreQuery(query)) {
    const engine = createGenreSearchEngine(music);
    return engine.search(query, { limit: 5 });
  }

  // Mood/weather tags use moodToQuery + plain search
  const searchQuery = type === 'genre' ? query : (moodToQuery(query) || query);
  return music.search(searchQuery, 5);
}

/**
 * Wire bubble events to a socket.
 * @param {object} io — socket.io server
 * @param {object} socket — client socket
 * @param {object} deps — { music, queue, profileOrchestrator, getWeatherRaw, playbackService }
 * @returns {function} cleanup function (clears interval)
 */
export function wireBubbleEvents(io, socket, deps) {
  const { music, queue } = deps;

  // Handle bubble click
  socket.on(EVENTS.CRAB_BUBBLE_CLICK, async (tag) => {
    try {
      if (!tag || !tag.query) return;

      const songs = await searchByBubbleTag(tag, music);
      if (!songs || songs.length === 0) {
        io.emit(EVENTS.DJ_MESSAGE, { text: `没找到${tag.label}的歌，换一个泡泡吧~` });
        return;
      }

      // Insert first song as next to play
      queue.insertNext(songs[0]);

      // Notify all clients
      io.emit(EVENTS.QUEUE_UPDATE, {
        upcomingSongs: queue.upcomingSongs,
        mode: queue.mode,
      });
      io.emit(EVENTS.DJ_MESSAGE, { text: `为你吹了一首${tag.label}♪` });
      io.emit(EVENTS.CRAB_ANIMATION, { state: 'bouncing' });
    } catch (e) {
      console.error('[Bubbles] click handler failed:', e.message);
      io.emit(EVENTS.DJ_MESSAGE, { text: '泡泡破了...再试一次吧' });
    }
  });

  // Start periodic bubble push
  const intervalId = setInterval(() => {
    pushBubbles(io, deps);
  }, BUBBLE_PUSH_INTERVAL_MS);

  // Note: initial push is triggered by cold start in handler.js
  // and on song-change via maybePushBubbles, not here.

  // Return cleanup function
  return () => {
    clearInterval(intervalId);
  };
}
