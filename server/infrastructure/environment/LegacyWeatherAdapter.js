import { getWeather, setClientLocation } from '../../services/weather.js';

/**
 * Wraps the legacy weather module behind WeatherPort.
 *
 * @param {{getWeather: () => Promise<string>, setClientLocation: (lat: number, lon: number) => void}=} legacy
 */
export function createLegacyWeatherAdapter(legacy = { getWeather, setClientLocation }) {
  return {
    current: () => legacy.getWeather(),
    setClientLocation: (lat, lon) => legacy.setClientLocation(lat, lon),
  };
}

export const legacyWeatherAdapter = createLegacyWeatherAdapter();
