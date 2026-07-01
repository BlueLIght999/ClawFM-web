import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';

/**
 * FileCorpus — implements the CorpusPort over the local filesystem.
 * Reads/writes the user preference corpus (taste.md / routines.md / mood-rules.md).
 *
 * baseDir is constructor-injected so business code depends on the port,
 * not on fs directly (arch rule D2/D5). Tests point baseDir at a temp dir.
 */
export class FileCorpus {
  /** @param {string} baseDir directory holding user/*.md */
  constructor(baseDir) {
    this._baseDir = baseDir;
  }

  _read(filename) {
    const p = resolve(this._baseDir, filename);
    if (existsSync(p)) return readFileSync(p, 'utf-8');
    return '';
  }

  _write(filename, content) {
    if (!existsSync(this._baseDir)) mkdirSync(this._baseDir, { recursive: true });
    writeFileSync(resolve(this._baseDir, filename), content, 'utf-8');
  }

  readTaste() { return this._read('taste.md'); }
  readRoutines() { return this._read('routines.md'); }
  readMoodRules() { return this._read('mood-rules.md'); }

  writeTaste(content) { this._write('taste.md', content); }
  writeRoutines(content) { this._write('routines.md', content); }
}
