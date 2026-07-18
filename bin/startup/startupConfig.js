import fs from 'fs';
import path from 'path';

export function parseEnvText(text) {
  const values = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    values[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
  }
  return values;
}

function configuredPort(value, fallback) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

export function loadStartupConfig(root, environment = process.env) {
  const envPath = path.resolve(root, '.env');
  const fileEnvironment = fs.existsSync(envPath) ? parseEnvText(fs.readFileSync(envPath, 'utf8')) : {};
  const effective = { ...fileEnvironment, ...environment };
  return {
    port: configuredPort(effective.PORT, 3333),
    neteasePort: configuredPort(effective.NETEASE_API_PORT, 4001),
  };
}

export function startupPortsValid({ port, neteasePort }) {
  const valid = value => Number.isInteger(value) && value >= 1 && value <= 65535;
  return valid(port) && valid(neteasePort) && port !== neteasePort;
}
