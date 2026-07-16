import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env') });

export default {
  port: parseInt(process.env.PORT || '3333', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  dataDir: resolve(__dirname, '..', 'data'),
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
  deepseekBaseUrl: 'https://api.deepseek.com',
  deepseekModel: 'deepseek-chat',
  netease: {
    cookieFile: resolve(__dirname, '..', 'data', 'cookies.json'),
    apiPort: parseInt(process.env.NETEASE_API_PORT || '4001', 10),
  },
  db: {
    path: resolve(__dirname, '..', 'data', 'radio.db'),
  },
  fishAudioApiKey: process.env.FISH_AUDIO_API_KEY || '',
  dashscopeApiKey: process.env.DASHSCOPE_API_KEY || '',
  tts: {
    voice: 'Ethan',
    model: 'qwen3-tts-flash',
    outputDir: resolve(__dirname, '..', 'data', 'tts'),
  },
  // Manual location override — set WEATHER_CITY in .env if IP geolocation is wrong
  location: {
    city: process.env.WEATHER_CITY || '',
    lat: parseFloat(process.env.WEATHER_LAT) || 0,
    lon: parseFloat(process.env.WEATHER_LON) || 0,
  },
  // Observability
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    style: process.env.LOG_STYLE || (process.env.NODE_ENV === 'production' ? 'json' : 'pretty'),
  },
  metrics: {
    enabled: process.env.METRICS_ENABLED !== 'false',
  },
  dashboard: {
    enabled: process.env.DASHBOARD_ENABLED !== 'false',
  },
};
