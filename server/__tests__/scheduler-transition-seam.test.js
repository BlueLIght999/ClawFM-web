import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('RadioScheduler transition lifecycle seam', () => {
  it('delegatesSongEndingTransitionDecisionsToDomainRules', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../services/scheduler.js'), 'utf-8');
    const start = source.indexOf('_onSongEnding()');
    const end = source.indexOf('/** Called by handler after TTS generation succeeds', start);
    const onSongEnding = source.slice(start, end);

    expect(source).toContain("from '../domain/playback/transitionLifecycle.js'");
    expect(onSongEnding).toContain('beginTransitionIfIdle(this.playhead');
    expect(onSongEnding).toContain('transitionSpeechPlan(nextSong)');
    expect(onSongEnding).toContain('shouldHonorTransition({');
    expect(onSongEnding).not.toContain('if (this.playhead._advancing) return');
    expect(onSongEnding).not.toContain('generationTimeoutMs: 60000');
    expect(onSongEnding).not.toContain('generationTimeoutMs: SPEECH_GEN_TIMEOUT_MS');
  });
});
