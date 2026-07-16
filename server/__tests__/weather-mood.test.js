import { describe, it, expect } from 'vitest';
import { inferWeatherMood, classifyWeather } from '../domain/environment/weatherMood.js';

/**
 * 特征测试 —— 天气心情推测纯函数。
 * WMO 天气代码 + 温度 + 时段 → { mood, genre, label }
 */
describe('weatherMood', () => {
  describe('classifyWeather', () => {
    it('sunny_code0', () => {
      expect(classifyWeather(0)).toBe('sunny');
    });

    it('sunny_code1', () => {
      expect(classifyWeather(1)).toBe('sunny');
    });

    it('cloudy_code2', () => {
      expect(classifyWeather(2)).toBe('cloudy');
    });

    it('overcast_code3', () => {
      expect(classifyWeather(3)).toBe('overcast');
    });

    it('foggy_code45', () => {
      expect(classifyWeather(45)).toBe('foggy');
    });

    it('rainy_code51', () => {
      expect(classifyWeather(51)).toBe('rainy');
    });

    it('rainy_code61', () => {
      expect(classifyWeather(61)).toBe('rainy');
    });

    it('heavyRain_code63', () => {
      expect(classifyWeather(63)).toBe('heavyRain');
    });

    it('heavyRain_code65', () => {
      expect(classifyWeather(65)).toBe('heavyRain');
    });

    it('snowy_code71', () => {
      expect(classifyWeather(71)).toBe('snowy');
    });

    it('rainy_code80', () => {
      expect(classifyWeather(80)).toBe('rainy');
    });

    it('heavyRain_code82', () => {
      expect(classifyWeather(82)).toBe('heavyRain');
    });

    it('stormy_code95', () => {
      expect(classifyWeather(95)).toBe('stormy');
    });

    it('unknown_fallsBackToCloudy', () => {
      expect(classifyWeather(999)).toBe('cloudy');
    });
  });

  describe('inferWeatherMood', () => {
    it('sunny_day_energetic_pop', () => {
      const result = inferWeatherMood(0, 25, 'afternoon');
      expect(result.mood).toBe('energetic');
      expect(result.genre).toBe('pop');
    });

    it('rainy_sad_jazz', () => {
      const result = inferWeatherMood(51, 18, 'afternoon');
      expect(result.mood).toBe('sad');
      expect(result.genre).toBe('jazz');
    });

    it('snowy_dreamy_ambient', () => {
      const result = inferWeatherMood(71, -2, 'afternoon');
      expect(result.mood).toBe('dreamy');
      expect(result.genre).toBe('ambient');
    });

    it('stormy_energetic_electronic', () => {
      const result = inferWeatherMood(95, 22, 'evening');
      expect(result.mood).toBe('energetic');
      expect(result.genre).toBe('electronic');
    });

    it('foggy_dreamy_dreampop', () => {
      const result = inferWeatherMood(45, 12, 'morning');
      expect(result.mood).toBe('dreamy');
      expect(result.genre).toBe('dreampop');
    });

    it('overcast_calm_ambient', () => {
      const result = inferWeatherMood(3, 20, 'afternoon');
      expect(result.mood).toBe('calm');
      expect(result.genre).toBe('ambient');
    });

    it('night_rainy_label_contains_rain_night', () => {
      const result = inferWeatherMood(51, 18, 'night');
      expect(result.label).toContain('雨夜');
    });

    it('morning_sunny_label_contains_morning', () => {
      const result = inferWeatherMood(0, 22, 'morning');
      expect(result.label).toContain('晨光');
    });

    it('night_snowy_label_contains_snow_night', () => {
      const result = inferWeatherMood(71, -3, 'night');
      expect(result.label).toContain('雪夜');
    });

    it('evening_cloudy_label_contains_dusk', () => {
      const result = inferWeatherMood(2, 20, 'evening');
      expect(result.label).toContain('黄昏');
    });

    it('hot_temp_energetic', () => {
      const result = inferWeatherMood(3, 35, 'afternoon');
      expect(result.mood).toBe('energetic');
    });

    it('cold_temp_calm', () => {
      const result = inferWeatherMood(0, -5, 'afternoon');
      expect(result.mood).toBe('calm');
    });

    it('returns_object_with_all_fields', () => {
      const result = inferWeatherMood(0, 25, 'afternoon');
      expect(result).toHaveProperty('mood');
      expect(result).toHaveProperty('genre');
      expect(result).toHaveProperty('label');
      expect(typeof result.label).toBe('string');
    });

    it('heavyRain_nostalgic_blues', () => {
      const result = inferWeatherMood(65, 16, 'evening');
      expect(result.mood).toBe('nostalgic');
      expect(result.genre).toBe('blues');
    });
  });
});
