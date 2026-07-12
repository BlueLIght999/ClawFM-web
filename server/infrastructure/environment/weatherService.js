/**
 * Weather service — Open-Meteo + browser geolocation
 * Prefers client-provided GPS/WiFi coordinates (accurate).
 * Falls back to IP geolocation if no client location yet.
 */

import config from '../../config.js';
import { formatWeather } from '../../domain/environment/formatWeather.js';

let weatherCache = null;
let weatherCacheTime = 0;
const TTL = 15 * 60 * 1000;
const HEADERS = { 'User-Agent': 'Qclaudio/1.0 (radio)' };

// Client-provided location (from browser geolocation)
let clientLoc = null;
// Cache for reverse geocode results
const geocodeCache = new Map();

/** Called by socket handler when browser sends GPS coordinates */
export function setClientLocation(lat, lon) {
  clientLoc = { lat, lon };
  weatherCache = null; // invalidate so next call re-fetches
  console.log('[Weather] Client location updated:', lat.toFixed(4), lon.toFixed(4));
}

/** Forward geocode city name → {lat, lon} via Open-Meteo */
async function geocodeCity(cityName) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=zh`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`geocoding: ${res.status}`);
  const data = await res.json();
  if (!data.results?.length) return null;
  const r = data.results[0];
  return { displayName: r.name || cityName, lat: r.latitude, lon: r.longitude };
}

/** Reverse geocode lat/lon → city name via Nominatim */
async function reverseGeocode(lat, lon) {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  if (geocodeCache.has(key)) return geocodeCache.get(key);

  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=zh&zoom=10`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`nominatim: ${res.status}`);
  const data = await res.json();
  const city = extractCityFromAddress(data);
  geocodeCache.set(key, city);
  return city;
}

function extractCityFromAddress(data) {
  const addr = data.address || {};
  return addr.city || addr.town || addr.county || addr.state || data.name || 'Unknown';
}

/** IP-based geolocation — tries ipip.net (accurate in China) then ipapi.co */
async function ipLocation() {
  const ipipResult = await tryIpipLocation();
  if (ipipResult) return ipipResult;

  const res = await fetch('https://ipapi.co/json/', { headers: HEADERS });
  if (!res.ok) throw new Error(`ipapi: ${res.status}`);
  const data = await res.json();
  return {
    city: data.city || 'Unknown',
    lat: data.latitude,
    lon: data.longitude,
  };
}

async function tryIpipLocation() {
  try {
    const res = await fetch('https://myip.ipip.net/', { headers: { 'User-Agent': 'curl/8.0' } });
    if (!res.ok) return null;
    const text = await res.text();
    const parsed = parseIpipText(text);
    if (!parsed) return null;
    const geo = await geocodeCity(parsed.city);
    if (geo) return { city: `${parsed.province}${parsed.city}`, lat: geo.lat, lon: geo.lon };
  } catch {
    // Falling back to IP lookup is expected when reverse geocoding is unavailable.
  }
  return null;
}

function parseIpipText(text) {
  const locPart = text.split('来自于：')[1]?.trim() || '';
  const parts = locPart.split(/\s+/);
  const city = parts[2] || parts[parts.length - 2] || '';
  const province = parts[1] || '';
  return city ? { city, province } : null;
}

async function resolveLocation() {
  // Config override (manual lat/lon)
  const cfg = config.location;
  if (cfg.lat && cfg.lon) {
    return { city: cfg.city || 'Unknown', lat: cfg.lat, lon: cfg.lon };
  }

  // Client browser geolocation (most accurate)
  if (clientLoc) {
    const city = await reverseGeocode(clientLoc.lat, clientLoc.lon);
    return { city, lat: clientLoc.lat, lon: clientLoc.lon };
  }

  // Fallback to IP
  return ipLocation();
}

async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code&timezone=auto`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`open-meteo: ${res.status}`);
  const data = await res.json();
  const c = data.current;
  return {
    temp: Math.round(c.temperature_2m),
    humidity: c.relative_humidity_2m,
    code: c.weather_code,
  };
}

/**
 * Returns a formatted weather string for the DJ context.
 * Format: "西安, 26°C, 阴, 湿度54%"
 */
export async function getWeather() {
  const now = Date.now();
  if (weatherCache && now - weatherCacheTime < TTL) return weatherCache;

  try {
    const loc = await resolveLocation();
    const w = await fetchWeather(loc.lat, loc.lon);
    const result = formatWeather(loc, w);
    weatherCache = result;
    weatherCacheTime = now;
    console.log('[Weather]', result);
    return result;
  } catch (e) {
    console.error('[Weather] fetch failed:', e.message);
    return weatherCache || '';
  }
}
