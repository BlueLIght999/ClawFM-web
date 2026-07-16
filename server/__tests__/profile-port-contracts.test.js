import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readSrc = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');

describe('D9: Port contracts for profile system', () => {
  it('profileQueryPortExists', () => {
    const src = readSrc('../application/ports/services/ProfileQueryPort.js');
    expect(src).toContain('@typedef {object} ProfileQueryPort');
    expect(src).toContain('getCurrentProfile');
    expect(src).toContain('getTopTags');
    expect(src).toContain('isFirstRun');
  });

  it('profileCommandPortExists', () => {
    const src = readSrc('../application/ports/services/ProfileCommandPort.js');
    expect(src).toContain('@typedef {object} ProfileCommandPort');
    expect(src).toContain('triggerCollection');
    expect(src).toContain('triggerFullBuild');
    expect(src).toContain('enrichSong');
  });

  it('clusterPortExists', () => {
    const src = readSrc('../application/ports/services/ClusterPort.js');
    expect(src).toContain('@typedef {object} ClusterPort');
    expect(src).toContain('getCurrentCluster');
    expect(src).toContain('findSimilarUsers');
    expect(src).toContain('onClusterChange');
  });

  it('profileSnapshotRepositoryPortExists', () => {
    const src = readSrc('../application/ports/repos/ProfileSnapshotRepository.js');
    expect(src).toContain('@typedef {object} ProfileSnapshotRepository');
    expect(src).toContain('save');
    expect(src).toContain('recent');
    expect(src).toContain('latest');
  });

  it('profileCollectionStateRepositoryPortExists', () => {
    const src = readSrc('../application/ports/repos/ProfileCollectionStateRepository.js');
    expect(src).toContain('@typedef {object} ProfileCollectionStateRepository');
    expect(src).toContain('get');
    expect(src).toContain('upsert');
    expect(src).toContain('getAll');
  });

  it('styleTagCacheRepositoryPortExists', () => {
    const src = readSrc('../application/ports/repos/StyleTagCacheRepository.js');
    expect(src).toContain('@typedef {object} StyleTagCacheRepository');
    expect(src).toContain('upsertTag');
    expect(src).toContain('getAllTags');
    expect(src).toContain('upsertMapping');
  });

  it('clusterResultRepositoryPortExists', () => {
    const src = readSrc('../application/ports/repos/ClusterResultRepository.js');
    expect(src).toContain('@typedef {object} ClusterResultRepository');
    expect(src).toContain('save');
    expect(src).toContain('latest');
  });
});
