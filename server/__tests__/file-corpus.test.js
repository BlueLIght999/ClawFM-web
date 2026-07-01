import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileCorpus } from '../infrastructure/storage/FileCorpus.js';

/**
 * 契约测试 —— FileCorpus 实现 CorpusPort：封装 user/*.md 的文件 IO。
 * 用真实临时目录验证读写语义（DI: baseDir 构造注入，无需 mock fs）。
 *
 * CorpusPort 契约：
 *   readTaste/readRoutines/readMoodRules(): string — 文件不存在返回 ''（不抛）
 *   writeTaste/writeRoutines(content): void — 写入，目录不存在自动创建
 *   写后读一致
 */
describe('FileCorpus (CorpusPort)', () => {
  let dir;
  let corpus;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'qclaudio-corpus-'));
    corpus = new FileCorpus(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('readTaste_missingFile_returnsEmptyString', () => {
    expect(corpus.readTaste()).toBe('');
    expect(corpus.readRoutines()).toBe('');
    expect(corpus.readMoodRules()).toBe('');
  });

  it('readTaste_existingFile_returnsContent', () => {
    writeFileSync(join(dir, 'taste.md'), '# 我的口味', 'utf-8');
    expect(corpus.readTaste()).toBe('# 我的口味');
  });

  it('writeTaste_thenRead_isConsistent', () => {
    corpus.writeTaste('喜欢 Reol');
    expect(corpus.readTaste()).toBe('喜欢 Reol');
  });

  it('writeRoutines_thenRead_isConsistent', () => {
    corpus.writeRoutines('早晨轻音乐');
    expect(corpus.readRoutines()).toBe('早晨轻音乐');
  });

  it('write_missingBaseDir_createsItAutomatically', () => {
    const nested = join(dir, 'sub', 'deep');
    const c = new FileCorpus(nested);
    c.writeTaste('自动建目录');
    expect(c.readTaste()).toBe('自动建目录');
  });

  it('readMoodRules_existingFile_returnsContent', () => {
    writeFileSync(join(dir, 'mood-rules.md'), '难过→民谣', 'utf-8');
    expect(corpus.readMoodRules()).toBe('难过→民谣');
  });
});
