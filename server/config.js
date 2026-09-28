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
    // Number() rather than parseFloat(process.env.X): the env lookup is
    // `string | undefined`, which parseFloat (typed `string`) rejects. Number('')
    // and Number(undefined) are both NaN, so the `|| 0` fallback is unchanged.
    lat: Number(process.env.WEATHER_LAT) || 0,
    lon: Number(process.env.WEATHER_LON) || 0,
  },
  // CORS — one allow-list shared by the HTTP app and the Socket.IO server.
  // They had drifted: Socket.IO listed the two dev origins, while `app.use(cors())`
  // granted every origin. On a server that carries member auth cookies, that is a
  // cross-origin read of authenticated responses. Origins are env-overridable so a
  // real deployment sets its own host without a code change.
  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3333')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
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
