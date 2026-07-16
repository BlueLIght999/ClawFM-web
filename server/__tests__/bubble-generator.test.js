import { describe, it, expect } from 'vitest';
import { generateBubbles } from '../domain/curation/BubbleGenerator.js';

/**
 * 特征测试 —— 泡泡标签生成器纯函数。
 * profile + weatherMood + timeOfDay → BubbleTag[]
 */
describe('BubbleGenerator', () => {
  describe('generateBubbles', () => {
    it('with_weatherMood_generates_weather_bubbles', () => {
      const weatherMood = { mood: 'sad', genre: 'jazz', label: '雨夜emo' };
      const result = generateBubbles(null, weatherMood, 'night');
      expect(result.length).toBeGreaterThan(0);
      // First bubble should be weather mood
      const weatherBubble = result.find(b => b.type === 'weather');
      expect(weatherBubble).toBeDefined();
      expect(weatherBubble.label).toBe('雨夜emo');
    });

    it('weatherMood_generates_genre_bubble_from_weather', () => {
      const weatherMood = { mood: 'sad', genre: 'jazz', label: '雨天爵士' };
      const result = generateBubbles(null, weatherMood, 'afternoon');
      const genreBubble = result.find(b => b.type === 'genre' && b.value === 'jazz');
      expect(genreBubble).toBeDefined();
    });

    it('null_weatherMood_skips_weather_bubbles', () => {
      const result = generateBubbles(null, null, 'afternoon');
      const weatherBubble = result.find(b => b.type === 'weather');
      expect(weatherBubble).toBeUndefined();
    });

    it('with_profile_genre_tags_takes_top2', () => {
      const profile = {
        tags: {
          genre: {
            pop: { weight: 0.9, evidenceCount: 10 },
            rock: { weight: 0.7, evidenceCount: 8 },
            jazz: { weight: 0.3, evidenceCount: 2 },
          },
        },
      };
      const result = generateBubbles(profile, null, 'afternoon');
      const genreBubbles = result.filter(b => b.type === 'genre');
      expect(genreBubbles.length).toBeLessThanOrEqual(2);
      // Top weighted should be first
      expect(genreBubbles[0].value).toBe('pop');
    });

    it('with_profile_mood_tags_takes_top1', () => {
      const profile = {
        tags: {
          mood: {
            happy: { weight: 0.8, evidenceCount: 5 },
            sad: { weight: 0.4, evidenceCount: 3 },
          },
        },
      };
      const result = generateBubbles(profile, null, 'afternoon');
      const moodBubbles = result.filter(b => b.type === 'mood');
      expect(moodBubbles.length).toBe(1);
      expect(moodBubbles[0].value).toBe('happy');
    });

    it('empty_profile_falls_back_to_defaults', () => {
      const result = generateBubbles(null, null, 'afternoon');
      expect(result.length).toBeGreaterThan(0);
      // Should contain some default genre entries
      const genreBubbles = result.filter(b => b.type === 'genre');
      expect(genreBubbles.length).toBeGreaterThan(0);
    });

    it('max_five_bubbles', () => {
      const profile = {
        tags: {
          genre: {
            pop: { weight: 0.9 }, rock: { weight: 0.8 }, jazz: { weight: 0.7 },
            folk: { weight: 0.6 }, electronic: { weight: 0.5 }, classical: { weight: 0.4 },
          },
          mood: { happy: { weight: 0.8 }, sad: { weight: 0.6 }, calm: { weight: 0.4 } },
        },
      };
      const weatherMood = { mood: 'chill', genre: 'lofi', label: '多云chill' };
      const result = generateBubbles(profile, weatherMood, 'afternoon');
      expect(result.length).toBeLessThanOrEqual(5);
    });

    it('deduplicates_by_value', () => {
      // Profile has jazz, weatherMood also has jazz genre
      const profile = {
        tags: {
          genre: { jazz: { weight: 0.9, evidenceCount: 10 } },
        },
      };
      const weatherMood = { mood: 'sad', genre: 'jazz', label: '雨天爵士' };
      const result = generateBubbles(profile, weatherMood, 'afternoon');
      const jazzBubbles = result.filter(b => b.value === 'jazz');
      expect(jazzBubbles.length).toBe(1);
    });

    it('genre_bubble_query_is_genre_value', () => {
      const profile = { tags: { genre: { jazz: { weight: 0.9 } } } };
      const result = generateBubbles(profile, null, 'afternoon');
      const jazzBubble = result.find(b => b.value === 'jazz');
      expect(jazzBubble.query).toBe('jazz');
    });

    it('mood_bubble_query_uses_moodToQuery', () => {
      const profile = { tags: { mood: { happy: { weight: 0.9 } } } };
      const result = generateBubbles(profile, null, 'afternoon');
      const moodBubble = result.find(b => b.type === 'mood');
      expect(moodBubble).toBeDefined();
      expect(moodBubble.query).toBeTruthy();
      expect(moodBubble.query).not.toBe('happy'); // Should be mapped
    });

    it('weather_bubble_has_weather_type', () => {
      const weatherMood = { mood: 'energetic', genre: 'pop', label: '晴朗活力' };
      const result = generateBubbles(null, weatherMood, 'morning');
      const weatherBubble = result.find(b => b.type === 'weather');
      expect(weatherBubble).toBeDefined();
      expect(weatherBubble.value).toBe('energetic');
    });

    it('weather_bubbles_at_front', () => {
      const profile = { tags: { genre: { rock: { weight: 0.9 } } } };
      const weatherMood = { mood: 'chill', genre: 'lofi', label: '多云chill' };
      const result = generateBubbles(profile, weatherMood, 'afternoon');
      // First two should be weather-related
      expect(result[0].type === 'weather' || result[1].type === 'weather').toBe(true);
    });

    it('each_bubble_has_required_fields', () => {
      const weatherMood = { mood: 'sad', genre: 'jazz', label: '雨天爵士' };
      const result = generateBubbles(null, weatherMood, 'afternoon');
      for (const bubble of result) {
        expect(bubble).toHaveProperty('id');
        expect(bubble).toHaveProperty('label');
        expect(bubble).toHaveProperty('type');
        expect(bubble).toHaveProperty('value');
        expect(bubble).toHaveProperty('query');
      }
    });
  });
});
