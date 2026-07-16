/**
 * Weather mood inference — pure function.
 *
 * Maps WMO weather code + temperature + time of day to a mood/genre/label tuple
 * for bubble generation.
 *
 * @module domain/environment/weatherMood
 */

/**
 * WMO weather code → weather category.
 * @param {number} code — WMO weather interpretation code
 * @returns {'sunny'|'cloudy'|'overcast'|'foggy'|'rainy'|'heavyRain'|'snowy'|'stormy'}
 */
export function classifyWeather(code) {
  if (code <= 1) return 'sunny';
  if (code <= 2) return 'cloudy';
  if (code === 3) return 'overcast';
  if (code >= 45 && code <= 48) return 'foggy';
  if (code >= 51 && code <= 55) return 'rainy';
  if (code >= 61 && code <= 62) return 'rainy';
  if (code >= 63 && code <= 65) return 'heavyRain';
  if (code >= 71 && code <= 75) return 'snowy';
  if (code >= 80 && code <= 82) return code === 82 ? 'heavyRain' : 'rainy';
  if (code >= 95 && code <= 99) return 'stormy';
  return 'cloudy';
}

// Base weather → mood/genre mapping
const WEATHER_MOOD_MAP = {
  sunny:     { mood: 'energetic', genre: 'pop',       label: '晴朗活力' },
  cloudy:    { mood: 'chill',     genre: 'lofi',      label: '多云chill' },
  overcast:  { mood: 'calm',      genre: 'ambient',   label: '阴天静心' },
  rainy:     { mood: 'sad',       genre: 'jazz',      label: '雨天爵士' },
  heavyRain: { mood: 'nostalgic', genre: 'blues',     label: '大雨怀旧' },
  snowy:     { mood: 'dreamy',    genre: 'ambient',   label: '雪天梦幻' },
  foggy:     { mood: 'dreamy',    genre: 'dreampop',  label: '雾天迷幻' },
  stormy:    { mood: 'energetic', genre: 'electronic', label: '雷暴电音' },
};

// Time-of-day label overrides: { weatherCategory: { timeOfDay: newLabel } }
const TIME_LABEL_OVERRIDES = {
  rainy:     { night: '雨夜emo' },
  snowy:     { night: '雪夜梦幻' },
  sunny:     { morning: '晨光活力' },
  cloudy:    { evening: '黄昏chill' },
};

/**
 * Infer a mood/genre/label from weather conditions.
 *
 * @param {number} weatherCode — WMO weather interpretation code
 * @param {number} temp — temperature in °C
 * @param {'morning'|'afternoon'|'evening'|'night'} timeOfDay
 * @returns {{ mood: string, genre: string, label: string }}
 */
export function inferWeatherMood(weatherCode, temp, timeOfDay) {
  const category = classifyWeather(weatherCode);
  const base = WEATHER_MOOD_MAP[category] || WEATHER_MOOD_MAP.cloudy;

  let { mood, label } = { ...base };
  const { genre } = base;

  // Time-of-day label override
  const timeOverride = TIME_LABEL_OVERRIDES[category]?.[timeOfDay];
  if (timeOverride) {
    label = timeOverride;
  }

  // Temperature modifiers — skip for weather categories that naturally
  // occur at those temperatures (snowy is already cold, sunny already warm)
  if (temp > 30 && category !== 'sunny') {
    mood = 'energetic';
  } else if (temp < 0 && category !== 'snowy') {
    mood = 'calm';
  }

  return { mood, genre, label };
}
