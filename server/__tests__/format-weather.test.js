import { describe, it, expect } from 'vitest';
import { formatWeather, describeWeatherCode } from '../domain/environment/formatWeather.js';

/**
 * 纯天气格式化逻辑的特征测试 —— 钉住 weather.js 现有行为，
 * 为 WeatherPort/WeatherAdapter 提炼可复用的纯内核（无网络、无缓存、可单测）。
 *
 * 现有行为（来自 services/weather.js）：
 *   格式: "${city}, ${temp}°C, ${desc}, 湿度${humidity}%"
 *   desc: WMO[code] 中文，未知码回退 "代码${code}"
 */
describe('describeWeatherCode', () => {
  it('knownCode_returnsChineseDescription', () => {
    expect(describeWeatherCode(0)).toBe('晴');
    expect(describeWeatherCode(3)).toBe('阴');
    expect(describeWeatherCode(65)).toBe('大雨');
    expect(describeWeatherCode(95)).toBe('雷暴');
  });

  it('unknownCode_returnsCodeFallback', () => {
    expect(describeWeatherCode(999)).toBe('代码999');
  });
});

describe('formatWeather', () => {
  it('fullData_formatsCityTempDescHumidity', () => {
    const result = formatWeather(
      { city: '西安' },
      { temp: 23, code: 3, humidity: 50 }
    );
    expect(result).toBe('西安, 23°C, 阴, 湿度50%');
  });

  it('unknownCode_usesCodeFallbackInString', () => {
    const result = formatWeather(
      { city: '北京' },
      { temp: 10, code: 999, humidity: 30 }
    );
    expect(result).toBe('北京, 10°C, 代码999, 湿度30%');
  });
});
