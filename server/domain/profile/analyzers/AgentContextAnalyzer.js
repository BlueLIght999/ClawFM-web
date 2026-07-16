/**
 * AgentContextAnalyzer — generates context for the DJ agent from
 * listener profile data. Extends BaseAnalyzer.
 *
 * Domain-layer abstraction. Extracts top tags, listening habits, and
 * chat style from a profile and builds a concise summary string suitable
 * for injecting into an LLM prompt. No IO lives here.
 *
 * Never import infrastructure, db, or application layers.
 */

import { BaseAnalyzer } from './BaseAnalyzer.js';

const PERIOD_LABELS = {
  morning: '早晨',
  afternoon: '下午',
  evening: '晚上',
  night: '深夜',
};

export class AgentContextAnalyzer extends BaseAnalyzer {
  /**
   * @param {Object} [opts]
   * @param {Object} [opts.eventBus] — optional bus exposing emit(type, payload)
   */
  constructor({ eventBus = null } = {}) {
    super({ name: 'AgentContextAnalyzer', eventBus });
  }

  /**
   * @param {Object} profile
   * @returns {Promise<Object>} { summary, topGenres, topMoods, … }
   */
  async analyze(profile) {
    if (!profile) {
      return this._defaultResult();
    }

    const topGenres = this._topTags(profile, 'genre', 5);
    const topMoods = this._topTags(profile, 'mood', 3);
    const topRegions = this._topTags(profile, 'region', 3);
    const listeningHabit = profile.analysis?.dailyHabit || null;
    const chatStyle = profile.analysis?.chatStyle || null;
    const emotion = profile.analysis?.emotion || null;

    const summary = this._buildSummary(topGenres, topMoods, listeningHabit, chatStyle, emotion);

    const result = {
      summary,
      topGenres: topGenres.map((t) => t.name),
      topMoods: topMoods.map((t) => t.name),
      topRegions: topRegions.map((t) => t.name),
      listeningHabit,
      chatStyle,
      emotion,
    };

    this.emit('analysis:completed', { type: 'agent_context', result });
    return result;
  }

  _defaultResult() {
    return {
      summary: '',
      topGenres: [],
      topMoods: [],
      listeningHabit: null,
      chatStyle: null,
    };
  }

  /**
   * Extract top-N tags from a profile dimension, sorted by weight desc.
   * @param {Object} profile
   * @param {string} dimension — 'genre' | 'mood' | 'region'
   * @param {number} limit
   * @returns {Array<{name:string, weight:number}>}
   */
  _topTags(profile, dimension, limit) {
    const tags = profile?.tags?.[dimension];
    if (!tags) return [];
    return Object.entries(tags)
      .map(([name, data]) => ({ name, weight: data.weight || 0 }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, limit);
  }

  /**
   * Build a semicolon-delimited summary string from profile components.
   * @param {Array}  genres
   * @param {Array}  moods
   * @param {Object} [habit]
   * @param {Object} [chatStyle]
   * @param {Object} [emotion]
   * @returns {string}
   */
  _buildSummary(genres, moods, habit, chatStyle, emotion) {
    const parts = [];

    if (genres.length > 0) {
      parts.push(`偏好流派: ${genres.map((g) => g.name).join('、')}`);
    }

    if (moods.length > 0) {
      parts.push(`当前情绪: ${moods.map((m) => m.name).join('、')}`);
    }

    if (habit) {
      const label = PERIOD_LABELS[habit.peakPeriod] || habit.peakPeriod;
      parts.push(`活跃时段: ${label}`);
    }

    if (chatStyle) {
      parts.push(`交流风格: ${chatStyle.style || '未知'}`);
    }

    if (emotion) {
      parts.push(`情绪状态: ${emotion.currentMood || '平静'}`);
    }

    return parts.join('; ');
  }
}
