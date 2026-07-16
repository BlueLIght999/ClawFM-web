import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname_local = dirname(fileURLToPath(import.meta.url));
const swContent = readFileSync(join(__dirname_local, '..', '..', 'public', 'sw.js'), 'utf-8');

describe('sw.js cache version', () => {
  it('uses v5 cache (bumped after refactor)', () => {
    expect(swContent).toContain("'qclaudio-v5'");
  });
});
