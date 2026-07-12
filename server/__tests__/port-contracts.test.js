import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readSrc = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');

describe('D9: Port contracts for legacy services', () => {
  it('playbackQueuePortExists', () => {
    const src = readSrc('../application/ports/services/PlaybackQueuePort.js');
    expect(src).toContain('@typedef {object} PlaybackQueuePort');
    expect(src).toContain('upcomingSongs');
    expect(src).toContain('init');
    expect(src).toContain('peek');
    expect(src).toContain('addSongs');
    expect(src).toContain('needsMore');
  });

  it('playbackSchedulerPortExists', () => {
    const src = readSrc('../application/ports/services/PlaybackSchedulerPort.js');
    expect(src).toContain('@typedef {object} PlaybackSchedulerPort');
    expect(src).toContain('getState');
    expect(src).toContain('startWithQueue');
    expect(src).toContain('getAudioUrl');
    expect(src).toContain('speechComplete');
    expect(src).toContain('getPlaybackPosition');
  });

  it('recommendationPortExists', () => {
    const src = readSrc('../application/ports/services/RecommendationPort.js');
    expect(src).toContain('@typedef {object} RecommendationPort');
    expect(src).toContain('fillQueue');
    expect(src).toContain('uid');
  });

  it('bootstrapImportsPortContracts', () => {
    const src = readSrc('../bootstrap.js');
    expect(src).toContain('PlaybackQueuePort');
    expect(src).toContain('PlaybackSchedulerPort');
    expect(src).toContain('RecommendationPort');
  });
});
