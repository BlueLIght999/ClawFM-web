/**
 * Weather mood inference — pure function.
 *
 * Maps WMO weather code + temperature + time of day to a mood/genre/label tuple
 * for bubble generation.
 *
 * @module domain/environment/weatherMood
 */

/**
 * Weather categories produced by classifyWeather. Declared as a named union so
 * the range table and the return type stay in step: adding a category to one
 * without the other is a type error rather than a silent gap.
 *
 * @typedef {'sunny'|'cloudy'|'overcast'|'foggy'|'rainy'|'heavyRain'|'snowy'|'stormy'} WeatherCategory
 */

/**
 * WMO weather code ranges -> weather category, in match order.
 *
 * Replaces a 10-branch if-chain (sonarjs cognitive-complexity 19). The list is
 * ordered and the first containing range wins, which is how the chain read.
 * Codes outside every range fall through to cloudy, matching the old default.
 * The old first branch was `code <= 1` and so also caught negative input; WMO
 * codes are 0-99, so the range starts at 0 and a negative value is treated as
 * out of range like any other unmapped code.
 *
 * @type {Array<{min: number, max: number, category: WeatherCategory}>}
 */
const WMO_RANGES = [
  { min: 0, max: 1, category: 'sunny' },
  { min: 2, max: 2, category: 'cloudy' },
  { min: 3, max: 3, category: 'overcast' },
  { min: 45, max: 48, category: 'foggy' },
  { min: 51, max: 55, category: 'rainy' },
  { min: 61, max: 62, category: 'rainy' },
  { min: 63, max: 65, category: 'heavyRain' },
  { min: 71, max: 75, category: 'snowy' },
  // 80-82 is a shower group: 82 is violent enough to count as heavy rain.
  { min: 80, max: 81, category: 'rainy' },
  { min: 82, max: 82, category: 'heavyRain' },
  { min: 95, max: 99, category: 'stormy' },
];

/**
 * WMO weather code → weather category.
 * @param {number} code - WMO weather interpretation code
 * @returns {'sunny'|'cloudy'|'overcast'|'foggy'|'rainy'|'heavyRain'|'snowy'|'stormy'}
 */
export function classifyWeather(code) {
  for (const { min, max, category } of WMO_RANGES) {
    if (code >= min && code <= max) return category;
  }
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
 * @param {number} weatherCode - WMO weather interpretation code
 * @param {number} temp - temperature in °C
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
