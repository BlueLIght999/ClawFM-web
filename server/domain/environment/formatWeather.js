/**
 * Pure weather formatting — no network, no cache, no IO.
 * Extracted from services/weather.js so WeatherAdapter (infrastructure)
 * can reuse it while the formatting stays unit-testable (domain).
 */

// WMO weather interpretation codes → Chinese description
const WMO = {
  0: '晴', 1: '少云', 2: '多云', 3: '阴',
  45: '雾', 48: '雾凇',
  51: '小雨', 53: '小雨', 55: '中雨',
  61: '小雨', 63: '中雨', 65: '大雨',
  71: '小雪', 73: '中雪', 75: '大雪',
  80: '阵雨', 81: '阵雨', 82: '暴雨',
  95: '雷暴', 96: '雷暴+冰雹', 99: '强雷暴+冰雹',
};

/** WMO code → Chinese description; unknown code falls back to "代码{code}". */
export function describeWeatherCode(code) {
  return WMO[code] || `代码${code}`;
}

/**
 * Format weather for DJ context.
 * @param {{ city: string }} location
 * @param {{ temp: number, code: number, humidity: number }} weather
 * @returns {string} e.g. "西安, 23°C, 阴, 湿度50%"
 */
export function formatWeather(location, weather) {
  const desc = describeWeatherCode(weather.code);
  return `${location.city}, ${weather.temp}°C, ${desc}, 湿度${weather.humidity}%`;
}
