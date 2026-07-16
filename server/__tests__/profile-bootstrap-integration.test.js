import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readSrc = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');

describe('Profile system bootstrap integration', () => {
  it('bootstrap_importsProfileOrchestrator', () => {
    const src = readSrc('../bootstrap.js');
    expect(src).toContain('ProfileOrchestrator');
    expect(src).toContain('ProfileEventBus');
  });

  it('bootstrap_importsProfileRepositories', () => {
    const src = readSrc('../bootstrap.js');
    expect(src).toContain('legacyProfileSnapshotRepository');
    expect(src).toContain('legacyProfileCollectionStateRepository');
    expect(src).toContain('legacyStyleTagCacheRepository');
    expect(src).toContain('legacyClusterResultRepository');
  });

  it('bootstrap_importsProfilePortContracts', () => {
    const src = readSrc('../bootstrap.js');
    expect(src).toContain('ProfileQueryPort');
    expect(src).toContain('ProfileCommandPort');
    expect(src).toContain('ClusterPort');
  });

  it('bootstrap_importsProfileConfigAndDb', () => {
    const src = readSrc('../bootstrap.js');
    expect(src).toContain('loadProfileConfig');
    expect(src).toContain('initProfileDb');
    expect(src).toContain('WebSearchAdapter');
  });

  it('bootstrap_createsProfileSystem', () => {
    const src = readSrc('../bootstrap.js');
    expect(src).toContain('createProfileSystem');
    expect(src).toContain('profileSystem');
  });

  it('bootstrap_returnsProfileSystemInServices', () => {
    const src = readSrc('../bootstrap.js');
    // Verify profileSystem is in the return object
    const returnBlockMatch = src.match(/return\s*\{[\s\S]*?profileSystem[\s\S]*?\}/);
    expect(returnBlockMatch).not.toBeNull();
  });

  it('bootstrap_profileSystemExposesPortInterface', () => {
    const src = readSrc('../bootstrap.js');
    expect(src).toContain('getPortImplementation()');
    expect(src).toContain('orchestrator');
    expect(src).toContain('eventBus');
    expect(src).toContain('pipelineSources');
  });
});
