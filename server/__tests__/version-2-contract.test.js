import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createReadiness } from '../infrastructure/health/readiness.js';

const root = path.resolve(import.meta.dirname, '..', '..');

function json(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

describe('Qclaudio 2.0.0 contract', () => {
  it('packageAndLockVersions_areAlignedTo2_0_0', () => {
    for (const workspace of ['', 'server/', 'client/']) {
      expect(json(`${workspace}package.json`).version).toBe('2.0.0');
      const lock = json(`${workspace}package-lock.json`);
      expect(lock.version).toBe('2.0.0');
      expect(lock.packages[''].version).toBe('2.0.0');
    }
  });

  it('serviceWorker_usesV7CacheForProtocolV2Client', () => {
    const source = fs.readFileSync(path.join(root, 'client/public/sw.js'), 'utf8');
    expect(source).toContain("'qclaudio-v7'");
  });

  it('readiness_withoutNpmEnvironment_reportsVersion2', () => {
    expect(createReadiness({ env: {}, pid: 42 }).version).toBe('2.0.0');
  });
});
