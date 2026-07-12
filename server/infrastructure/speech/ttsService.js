import fs from 'fs';
import path from 'path';
import config from '../../config.js';
import { EdgeTTS } from '@travisvn/edge-tts';
import { cleanTtsText } from '../../domain/hosting/cleanTtsText.js';

const ttsCache = new Map();

// ── Providers ──────────────────────────────────────────────

const DASHSCOPE_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
const DASH_VOICE = 'Ethan';
const DASH_MODEL = 'qwen3-tts-flash';
const EDGE_VOICE = 'en-US-EricNeural'; // Male, deep/professional — close to Ethan

// ── Module-level health state ──────────────────────────────

let ttsStatus = {
  checked: false,
  available: null,      // true | false | null
  provider: null,       // 'dashscope' | 'edge' | null
  reason: '',
  lastChecked: 0,
};

export function isTtsAvailable() {
  if (!ttsStatus.checked) return null;
  return ttsStatus.available;
}

export function getTtsStatus() {
  return { ...ttsStatus };
}

export async function checkTtsHealth() {
  ttsStatus = { checked: false, available: null, provider: null, reason: '', lastChecked: Date.now() };

  const dashResult = await checkDashscopeHealth();
  if (dashResult === true) {
    ttsStatus = { checked: true, available: true, provider: 'dashscope', reason: '', lastChecked: Date.now() };
    console.log('[TTS] Health check PASSED — DashScope');
    return ttsStatus;
  }

  // Test Edge TTS
  try {
    const edge = new EdgeTTS('Testing text to speech.', EDGE_VOICE, { rate: '+5%' });
    const result = await edge.synthesize();
    await result.audio.arrayBuffer();
    ttsStatus = { checked: true, available: true, provider: 'edge', reason: '', lastChecked: Date.now() };
    console.log('[TTS] Health check PASSED — Edge TTS (fallback)');
    return ttsStatus;
  } catch (e) {
    console.warn(`[TTS] Edge TTS health check FAILED: ${e.message.slice(0, 80)}`);
  }

  ttsStatus = { checked: true, available: false, provider: null, reason: 'Both DashScope and Edge TTS unavailable', lastChecked: Date.now() };
  console.warn('[TTS] Health check FAILED — all providers offline. DJ will be text-only.');
  return ttsStatus;
}

async function checkDashscopeHealth() {
  if (!config.dashscopeApiKey) {
    console.warn('[TTS] DashScope API key not configured. Trying Edge TTS...');
    return null;
  }
  try {
    const res = await fetch(DASHSCOPE_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${config.dashscopeApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: DASH_MODEL, input: { text: 'Testing text to speech.', voice: DASH_VOICE, language_type: 'Auto' } }),
    });
    if (res.ok) {
      const json = await res.json();
      if (json?.output?.audio?.url) return true;
    }
    const errText = await res.text().catch(() => '');
    const code = parseDashscopeError(errText);
    console.warn(`[TTS] DashScope health check FAILED: ${code}. Trying Edge TTS...`);
    return false;
  } catch (e) {
    console.warn(`[TTS] DashScope health check FAILED (network): ${e.message.slice(0, 80)}. Trying Edge TTS...`);
    return false;
  }
}

function parseDashscopeError(errText) {
  try { return JSON.parse(errText).code || ''; } catch { return errText.slice(0, 80); }
}

// ── Edge TTS (free fallback) ────────────────────────────────

async function edgeTts(text) {
  const cleanText = cleanTtsText(text);
  if (!cleanText) return null;

  const cacheKey = `e_${Buffer.from(cleanText.slice(0, 80)).toString('base64').slice(0, 32)}`;
  if (ttsCache.has(cacheKey)) return ttsCache.get(cacheKey);

  const outDir = config.tts.outputDir;
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const fileName = `tts_e_${Date.now()}.mp3`;
  const outPath = path.join(outDir, fileName);

  try {
    console.log(`[TTS] Edge generating (${cleanText.length} chars, voice=${EDGE_VOICE})...`);
    const edge = new EdgeTTS(cleanText, EDGE_VOICE, { rate: '+5%' });
    const result = await edge.synthesize();
    const audioBuffer = Buffer.from(await result.audio.arrayBuffer());
    fs.writeFileSync(outPath, audioBuffer);

    const localUrl = `/audio/tts/${fileName}`;
    ttsCache.set(cacheKey, localUrl);
    if (ttsCache.size > 100) ttsCache.delete(ttsCache.keys().next().value);
    console.log(`[TTS] Edge done: ${(cleanText.length / 1024).toFixed(1)} KB → ${fileName}`);
    return localUrl;
  } catch (e) {
    console.error('[TTS] Edge failed:', e.message.slice(0, 150));
    return null;
  }
}

// ── DashScope TTS (primary) ─────────────────────────────────

async function dashscopeTts(text) {
  const cleanText = cleanTtsText(text);
  if (!cleanText) return null;

  const cacheKey = `ds_${Buffer.from(cleanText.slice(0, 80)).toString('base64').slice(0, 32)}`;
  if (ttsCache.has(cacheKey)) return ttsCache.get(cacheKey);

  const outDir = config.tts.outputDir;
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  try {
    console.log(`[TTS] DashScope generating (${cleanText.length} chars, voice=${DASH_VOICE})...`);
    const response = await fetch(DASHSCOPE_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${config.dashscopeApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: DASH_MODEL, input: { text: cleanText, voice: DASH_VOICE, language_type: 'Auto' } }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error(`[TTS] DashScope API error ${response.status}: ${parseDashscopeError(errText)}`);
      return null;
    }

    const json = await response.json();
    const audioUrl = json?.output?.audio?.url;
    if (!audioUrl) {
      console.error('[TTS] No audio URL in DashScope response:', JSON.stringify(json).slice(0, 200));
      return null;
    }

    return await downloadOssAudio(audioUrl, outDir, cacheKey, cleanText);
  } catch (e) {
    console.error('[TTS] DashScope failed:', e.message.slice(0, 150));
    return null;
  }
}

async function downloadOssAudio(audioUrl, outDir, cacheKey, cleanText) {
  try {
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) {
      console.error(`[TTS] Failed to download OSS audio: ${audioRes.status}`);
      return null;
    }
    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
    const fileName = `tts_ds_${Date.now()}.mp3`;
    const outPath = path.join(outDir, fileName);
    fs.writeFileSync(outPath, audioBuffer);

    const localUrl = `/audio/tts/${fileName}`;
    ttsCache.set(cacheKey, localUrl);
    if (ttsCache.size > 100) ttsCache.delete(ttsCache.keys().next().value);
    console.log(`[TTS] DashScope done: ${(cleanText.length / 1024).toFixed(1)} KB → ${fileName}`);
    return localUrl;
  } catch (e) {
    console.error('[TTS] Failed to download/save OSS audio:', e.message.slice(0, 100));
    return null;
  }
}

// ── Public API ──────────────────────────────────────────────

export async function generateSpeech(text) {
  if (!text?.trim()) return null;

  // Short-circuit: both providers known dead
  if (ttsStatus.checked && ttsStatus.available === false) return null;

  // 1. Try DashScope (primary)
  if (config.dashscopeApiKey) {
    const url = await dashscopeTts(text);
    if (url) return url;
  }

  // 2. Fallback to Edge TTS
  console.log('[TTS] DashScope returned null, falling back to Edge TTS...');
  const edgeUrl = await edgeTts(text);
  if (edgeUrl) {
    // Update status to reflect Edge is active
    if (!ttsStatus.checked || ttsStatus.provider !== 'edge') {
      ttsStatus = { checked: true, available: true, provider: 'edge', reason: 'DashScope unavailable, using Edge TTS', lastChecked: Date.now() };
    }
    return edgeUrl;
  }

  // 3. Both failed — mark unavailable
  ttsStatus = { checked: true, available: false, provider: null, reason: 'Both providers failed', lastChecked: Date.now() };
  return null;
}

export function isConfigured() {
  return !!(config.dashscopeApiKey || true); // Edge is always available
}
