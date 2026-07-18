import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('RadioScheduler transition lifecycle seam', () => {
  it('delegatesSongEndingTransitionDecisionsToDomainRules', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../services/scheduler.js'), 'utf-8');

    // _onSongEnding now delegates to TransitionOrchestrator
    expect(source).toContain('TransitionOrchestrator');
    expect(source).toContain('this._transitionOrch.onSongEnding()');
    // Domain lifecycle rules no longer inlined in scheduler
    expect(source).not.toContain("from '../domain/playback/transitionLifecycle.js'");

    // TransitionOrchestrator uses domain rules
    const orchSource = fs.readFileSync(path.resolve(__dirname, '../domain/playback/TransitionOrchestrator.js'), 'utf-8');
    expect(orchSource).toContain("from './transitionLifecycle.js'");
    expect(orchSource).toContain('transitionSpeechPlan');
    expect(orchSource).toContain('shouldHonorTransition');
  });
});
