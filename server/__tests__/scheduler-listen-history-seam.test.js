import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('RadioScheduler listen history seam', () => {
  it('delegatesListenHistoryPayloadToDomainRules', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../services/scheduler.js'), 'utf-8');

    expect(source).toContain("from '../domain/playback/listenHistoryRecord.js'");
    expect(source.match(/buildListenHistoryRecord/g)).toHaveLength(3);
    expect(source).not.toContain('songId: String(this.playhead.currentSong.id');
    expect(source).not.toContain('_getArtist(song)');
  });
});
