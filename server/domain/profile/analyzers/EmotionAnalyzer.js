/**
 * EmotionAnalyzer — tracks emotional shifts from listening patterns.
 *
 * Domain-layer analyzer. Extends BaseAnalyzer. No IO, no infrastructure/db/
 * application imports. Computes mood scores from profile tags and chat
 * keyword matching, detects dominant mood, and identifies shifts relative
 * to the profile's previously recorded mood.
 *
 * Emits 'emotion:shifted' when a mood change is detected.
 */

import { BaseAnalyzer } from './BaseAnalyzer.js';

const MOOD_KEYWORDS = {
  happy: ['开心', '快乐', '高兴', '愉快', 'happy', 'joy'],
  sad: ['难过', '伤心', '悲伤', 'sad', 'blue'],
  energetic: ['激动', '兴奋', 'energetic', 'pump'],
  calm: ['平静', '放松', 'calm', 'chill', 'relax'],
  nostalgic: ['怀旧', '回忆', 'nostalgic', 'memory'],
  romantic: ['浪漫', '爱情', 'romantic', 'love'],
};

const ENERGY_ORDER = ['sad', 'calm', 'nostalgic', 'romantic', 'happy', 'energetic'];

export class EmotionAnalyzer extends BaseAnalyzer {
  constructor({ eventBus = null } = {}) {
    super({ name: 'EmotionAnalyzer', eventBus });
  }

  async analyze(profile, options = {}) {
    const listenEvidence = options.listenEvidence || [];
    const chatEvidence = options.chatEvidence || [];

    const moodScores = this._computeMoodScores(listenEvidence, chatEvidence, profile);
    const dominantMood = this._findDominantMood(moodScores);
    const shift = this._detectShift(profile, dominantMood);

    const result = {
      currentMood: dominantMood,
      moodScores,
      shift: shift.direction,
      previousMood: shift.previous,
    };

    if (shift.direction !== 'stable') {
      this.emit('emotion:shifted', result);
    }
    return result;
  }

  _computeMoodScores(listenEvidence, chatEvidence, profile) {
    const scores = this._initMoodScores();
    this._accumulateProfileMoods(scores, profile);
    this._accumulateChatMoods(scores, chatEvidence);
    this._normalizeScores(scores);
    return scores;
  }

  _initMoodScores() {
    const scores = {};
    for (const mood of Object.keys(MOOD_KEYWORDS)) scores[mood] = 0;
    return scores;
  }

  _accumulateProfileMoods(scores, profile) {
    if (!profile?.tags?.mood) return;
    for (const [mood, data] of Object.entries(profile.tags.mood)) {
      if (scores[mood] !== undefined) scores[mood] += data.weight || 0;
    }
  }

  _accumulateChatMoods(scores, chatEvidence) {
    for (const msg of chatEvidence) {
      const text = (msg.content || '').toLowerCase();
      for (const [mood, keywords] of Object.entries(MOOD_KEYWORDS)) {
        scores[mood] += this._countKeywordMatches(text, keywords);
      }
    }
  }

  _countKeywordMatches(text, keywords) {
    let score = 0;
    for (const kw of keywords) {
      if (text.includes(kw.toLowerCase())) score += 0.1;
    }
    return score;
  }

  _normalizeScores(scores) {
    const total = Object.values(scores).reduce((a, b) => a + b, 0);
    if (total > 0) {
      for (const mood of Object.keys(scores)) {
        scores[mood] = Math.round(scores[mood] / total * 100) / 100;
      }
    }
  }

  _findDominantMood(scores) {
    let max = 0;
    let dominant = 'calm';
    for (const [mood, score] of Object.entries(scores)) {
      if (score > max) { max = score; dominant = mood; }
    }
    return dominant;
  }

  _detectShift(profile, currentMood) {
    const previous = profile?.analysis?.emotion?.currentMood;
    if (!previous) return { direction: 'stable', previous: null };
    if (previous === currentMood) return { direction: 'stable', previous };

    const prevIdx = ENERGY_ORDER.indexOf(previous);
    const currIdx = ENERGY_ORDER.indexOf(currentMood);
    if (currIdx > prevIdx) return { direction: 'up', previous };
    if (currIdx < prevIdx) return { direction: 'down', previous };
    return { direction: 'shift', previous };
  }
}
