import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

let cachedPersona = null;

/**
 * Load DJ persona from prompts/dj-persona.md.
 * Cached after first load.
 * @returns {string}
 */
export function loadDjPersona() {
  if (cachedPersona) return cachedPersona;
  const path = resolve(ROOT, 'prompts', 'dj-persona.md');
  if (existsSync(path)) {
    cachedPersona = readFileSync(path, 'utf-8');
  } else {
    cachedPersona = '你是 Dan，Qclaudio 88.7 电台的 AI DJ，一个 24/7 不间断的音乐电台。请用中文进行所有播报。';
  }
  return cachedPersona;
}
