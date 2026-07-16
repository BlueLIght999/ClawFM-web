/**
 * ChatStyleAnalyzer — analyzes chat history to determine user's chat style.
 *
 * Domain-layer analyzer. Extends BaseAnalyzer. No IO, no infrastructure/db/
 * application imports. Pure logic operating on evidence arrays passed via
 * the analyze() options.
 *
 * Classification dimensions:
 *   - Length: concise (avg < 30) vs detailed (avg > 30)
 *   - Formality: casual (score < 0.6) vs formal (score > 0.6)
 *   - Question rate → inquisitive tag when > 0.3
 */

import { BaseAnalyzer } from './BaseAnalyzer.js';

const FORMAL_MARKERS = ['您', '请问', '麻烦', '谢谢', '感谢', '请问您'];
const CASUAL_MARKERS = ['哈哈', '嗯', '哦', '嘿', '哈', '啊', '呢', '吧', '啦'];
const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;

export class ChatStyleAnalyzer extends BaseAnalyzer {
  constructor({ eventBus = null } = {}) {
    super({ name: 'ChatStyleAnalyzer', eventBus });
  }

  async analyze(profile, options = {}) {
    const chatEvidence = options.chatEvidence || [];
    if (chatEvidence.length === 0) {
      return { style: 'unknown', tags: [], confidence: 0 };
    }

    const metrics = this._computeMetrics(chatEvidence);
    const style = this._classifyStyle(metrics);
    const tags = this._generateTags(metrics, style);

    const result = {
      style: style.primary,
      tags,
      confidence: style.confidence,
      metrics: {
        avgMessageLength: Math.round(metrics.avgLength * 10) / 10,
        formalityScore: Math.round(metrics.formality * 100) / 100,
        emojiUsage: Math.round(metrics.emojiRate * 100) / 100,
        questionRate: Math.round(metrics.questionRate * 100) / 100,
      },
    };

    this.emit('analysis:completed', { type: 'chat_style', result });
    return result;
  }

  _computeMetrics(chatEvidence) {
    const userMessages = chatEvidence.filter(e => e.role === 'user' || e.type === 'chat');
    if (userMessages.length === 0) {
      return { avgLength: 0, formality: 0, emojiRate: 0, questionRate: 0, messageCount: 0 };
    }

    const avgLength = this._computeAvgLength(userMessages);
    const formality = this._computeFormality(userMessages);
    const emojiRate = this._computeEmojiRate(userMessages);
    const questionRate = this._computeQuestionRate(userMessages);

    return { avgLength, formality, emojiRate, questionRate, messageCount: userMessages.length };
  }

  _computeAvgLength(messages) {
    const lengths = messages.map(m => (m.content || '').length);
    return lengths.reduce((a, b) => a + b, 0) / lengths.length;
  }

  _computeFormality(messages) {
    let formalCount = 0;
    let casualCount = 0;
    for (const m of messages) {
      const text = m.content || '';
      formalCount += this._countMarkers(text, FORMAL_MARKERS);
      casualCount += this._countMarkers(text, CASUAL_MARKERS);
    }
    const total = formalCount + casualCount;
    return total > 0 ? formalCount / total : 0.5;
  }

  _countMarkers(text, markers) {
    let count = 0;
    for (const marker of markers) {
      if (text.includes(marker)) count++;
    }
    return count;
  }

  _computeEmojiRate(messages) {
    const emojiCount = messages.reduce(
      (sum, m) => sum + ((m.content || '').match(EMOJI_REGEX) || []).length,
      0
    );
    return emojiCount / messages.length;
  }

  _computeQuestionRate(messages) {
    const questionCount = messages.filter(m => {
      const text = m.content || '';
      return text.includes('?') || text.includes('？');
    }).length;
    return questionCount / messages.length;
  }

  _classifyStyle(metrics) {
    const { avgLength, formality } = metrics;

    const primary = avgLength > 30 ? 'detailed' : 'concise';
    const secondary = formality > 0.6 ? 'formal' : 'casual';

    const lengthConfidence = avgLength < 10 || avgLength > 50 ? 0.9 : 0.6;
    const formalityConfidence = Math.abs(formality - 0.5) > 0.3 ? 0.9 : 0.5;
    const confidence = Math.min(lengthConfidence, formalityConfidence);

    return { primary: `${primary}_${secondary}`, confidence };
  }

  _generateTags(metrics, style) {
    const tags = [];
    if (style.primary.startsWith('concise')) {
      tags.push({ dimension: 'chat', name: 'concise', confidence: style.confidence });
    }
    if (style.primary.startsWith('detailed')) {
      tags.push({ dimension: 'chat', name: 'detailed', confidence: style.confidence });
    }
    if (style.primary.endsWith('casual')) {
      tags.push({ dimension: 'chat', name: 'casual', confidence: style.confidence });
    }
    if (style.primary.endsWith('formal')) {
      tags.push({ dimension: 'chat', name: 'formal', confidence: style.confidence });
    }
    if (metrics.questionRate > 0.3) {
      tags.push({ dimension: 'chat', name: 'inquisitive', confidence: 0.7 });
    }
    return tags;
  }
}
