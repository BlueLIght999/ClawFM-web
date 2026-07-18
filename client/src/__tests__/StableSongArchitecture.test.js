import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const srcRoot = path.resolve(import.meta.dirname, '..');

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(fullPath);
    return /\.(js|jsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

describe('stable Song frontend architecture', () => {
  it('productionSource_doesNotReadNeteaseSongFieldsOrV1SongEvents', () => {
    const source = sourceFiles(srcRoot).map(file => fs.readFileSync(file, 'utf8')).join('\n');

    expect(source).not.toMatch(/\.(ar|al|dt)\b/);
    expect(source).not.toMatch(/['"]radio:(state|song-change|queue-update)['"]/);
  });
});
