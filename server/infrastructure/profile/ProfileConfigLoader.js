/**
 * Loads JSON config files from the profile config directory.
 * Returns a merged config object with defaults.
 */
import fs from 'fs';
import path from 'path';

const DEFAULT_CONFIG_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '')),
  '../../domain/profile/config',
);

const DEFAULTS = {
  tagTaxonomy: { version: 1, dimensions: {}, confidence: {} },
  collectors: { version: 1, collectors: {} },
  enrichmentChain: { version: 1, songChain: [], fallback: 'mark_unknown' },
  schedule: {
    version: 1,
    analysisIntervalHours: 100,
    firstRunMode: 'full',
    conditionalTriggers: {},
    snapshotRetention: 30,
  },
};

function readJsonSafe(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function loadConfig(configDir = DEFAULT_CONFIG_DIR) {
  const tagTaxonomy = readJsonSafe(path.join(configDir, 'tag-taxonomy.json')) ?? DEFAULTS.tagTaxonomy;
  const collectors = readJsonSafe(path.join(configDir, 'collectors.config.json')) ?? DEFAULTS.collectors;
  const enrichmentChain = readJsonSafe(path.join(configDir, 'enrichment-chain.config.json')) ?? DEFAULTS.enrichmentChain;
  const schedule = readJsonSafe(path.join(configDir, 'schedule.config.json')) ?? DEFAULTS.schedule;

  return { tagTaxonomy, collectors, enrichmentChain, schedule };
}

export function loadConfigByName(name, configDir = DEFAULT_CONFIG_DIR) {
  const map = {
    tagTaxonomy: 'tag-taxonomy.json',
    collectors: 'collectors.config.json',
    enrichmentChain: 'enrichment-chain.config.json',
    schedule: 'schedule.config.json',
  };
  const fileName = map[name];
  if (!fileName) throw new Error(`Unknown config: ${name}`);
  return readJsonSafe(path.join(configDir, fileName)) ?? DEFAULTS[name];
}
