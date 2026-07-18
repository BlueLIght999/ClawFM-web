/**
 * TransitionOrchestrator — domain logic for song transition lifecycle.
 *
 * Manages the transition between songs:
 *   1. Detect song ending (onSongEnding)
 *   2. Record listen history
 *   3. Determine speech plan (normal vs refill)
 *   4. Create SpeechTimer with timeout callbacks
 *   5. Dispatch onDjSpeechNeeded callback
 *   6. Advance to next song on speechComplete or timeout
 *
 * Extracted from scheduler.js _onSongEnding / speechComplete / _advanceToNext.
 */

import { SpeechTimer } from './speechTimer.js';
import { buildListenHistoryRecord } from './listenHistoryRecord.js';
import {
  shouldHonorTransition,
  transitionSpeechPlan,
} from './transitionLifecycle.js';

export class TransitionOrchestrator {
  constructor({
    playhead,
    queue,
    listenHistory,
    onDjSpeechNeeded = null,
    onAdvance = null,
    refillSongProvider = null,
  } = {}) {
    this.playhead = playhead;
    this.queue = queue;
    this.listenHistory = listenHistory;
    this.onDjSpeechNeeded = onDjSpeechNeeded;
    this.onAdvance = onAdvance;
    this.refillSongProvider = refillSongProvider;
    this._transitionId = 0;
    this._speechTimer = null;
  }

  get isAdvancing() {
    return !!this.playhead._advancing;
  }

  onSongEnding() {
    if (this.playhead._advancing) {
      return { started: false };
    }
    this.playhead._advancing = true;
    this._transitionId++;
    const myId = this._transitionId;

    const historyRecord = buildListenHistoryRecord({
      song: this.playhead.currentSong,
      durationMs: this.playhead.songDuration,
    });
    if (historyRecord) this.listenHistory.record(historyRecord);

    const prevSong = this.playhead.currentSong;
    const peekedNext = this.queue.peek();
    const isRefill = !peekedNext;
    const nextSong = isRefill && this.refillSongProvider
      ? this.refillSongProvider()
      : (peekedNext || transitionSpeechPlan(null).nextSong);

    const speechPlan = transitionSpeechPlan(isRefill ? null : nextSong);

    if (this._speechTimer) {
      this._speechTimer.dispose();
      this._speechTimer = null;
    }

    this._speechTimer = new SpeechTimer({
      generationTimeoutMs: speechPlan.generationTimeoutMs,
      onGenerationTimeout: () => {
        if (!shouldHonorTransition({ currentTransitionId: this._transitionId, expectedTransitionId: myId })) return;
        console.log('[TransitionOrchestrator] Speech generation timeout — advancing without speech');
        this._doAdvance();
      },
      onPlaybackTimeout: () => {
        if (!shouldHonorTransition({ currentTransitionId: this._transitionId, expectedTransitionId: myId })) return;
        console.log('[TransitionOrchestrator] Speech playback timeout — advancing');
        this._doAdvance();
      },
    });
    this._speechTimer.startGeneration();

    if (this.onDjSpeechNeeded) {
      this.onDjSpeechNeeded(prevSong, nextSong, myId);
    } else {
      this._doAdvance();
    }

    return { started: true, transitionId: myId, kind: isRefill ? 'refill' : 'normal' };
  }

  speechGenerationDone(speechDurationSec = 8) {
    if (this._speechTimer) {
      this._speechTimer.speechStarted(speechDurationSec);
    }
  }

  speechComplete() {
    if (this._speechTimer) {
      this._speechTimer.speechFinished();
      this._speechTimer.dispose();
      this._speechTimer = null;
    }
    if (!this.playhead._advancing) {
      console.log('[TransitionOrchestrator] speechComplete called but not advancing — already transitioned');
      return;
    }
    this.playhead._advancing = false;
    this._doAdvance();
  }

  cancel() {
    if (this._speechTimer) {
      this._speechTimer.dispose();
      this._speechTimer = null;
    }
  }

  _doAdvance() {
    if (this.onAdvance) this.onAdvance();
  }
}
