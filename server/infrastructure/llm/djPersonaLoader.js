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
    cachedPersona = 'You are Dan, the AI DJ of Qclaudio 88.7, a 24/7 radio station.';
  }
  return cachedPersona;
}
