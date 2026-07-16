import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('RadioScheduler seek() paused-state guard', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../services/scheduler.js'),
    'utf-8',
  );
  const seekStart = source.indexOf('seek(positionSeconds)');
  const seekEnd = source.indexOf('pause()', seekStart);
  const seekMethod = source.slice(seekStart, seekEnd);

  it('seek_checksIsPlayingBeforeSettingTransitionTimer', () => {
    expect(seekMethod).toContain('this.playhead.isPlaying');
    expect(seekMethod).toContain('nextTransitionDelayMs');
  });

  it('seek_doesNotSetTimerWhenPaused', () => {
    // The transition timer setup must be inside the isPlaying guard block
    const timerSetupIndex = seekMethod.indexOf('this.playhead.transitionTimer = setTimeout');
    const isPlayingIndex = seekMethod.indexOf('this.playhead.isPlaying');

    expect(isPlayingIndex).toBeGreaterThan(-1);
    expect(timerSetupIndex).toBeGreaterThan(isPlayingIndex);

    // Verify the guard wraps the timer setup
    const guardBlock = seekMethod.slice(
      isPlayingIndex,
      seekMethod.indexOf('this._notifyState()', isPlayingIndex),
    );
    expect(guardBlock).toContain('nextTransitionDelayMs');
    expect(guardBlock).toContain('setTimeout');
  });
});
