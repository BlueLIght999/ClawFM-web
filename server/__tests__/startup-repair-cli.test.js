import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..', '..');

describe('launcher repair command', () => {
  it('packageScripts_exposesExplicitRepairWithoutChangingStart', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

    expect(manifest.scripts.repair).toBe('node bin/qclaudio.js repair --no-open');
    expect(manifest.scripts.start).toBe('node bin/qclaudio.js');
  });

  it('qclaudio_repairMode_delegatesToDependencyRepair', () => {
    const source = fs.readFileSync(path.join(root, 'bin', 'qclaudio.js'), 'utf8');

    expect(source).toContain("process.argv[2] === 'repair'");
    expect(source).toContain('repairProjectDependencies');
  });
});
