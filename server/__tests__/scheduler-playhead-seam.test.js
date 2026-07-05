import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('RadioScheduler Playhead seam', () => {
  it('delegatesPlayheadStateTransitionsToDomainRules', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../services/scheduler.js'), 'utf-8');

    expect(source).toContain("from '../domain/playback/playheadRules.js'");
    expect(source).toContain('playheadElapsedMs(this.playhead');
    expect(source).toContain('pausePlayhead(this.playhead');
    expect(source).toContain('resumePlayhead(this.playhead');
    expect(source).toContain('seekPlayhead(this.playhead');
    expect(source).not.toContain('this.playhead.remainingAtPause = this.playhead.songDuration - this.elapsed');
    expect(source).not.toContain('this.playhead.startedAt = Date.now() - positionMs');
  });
});
