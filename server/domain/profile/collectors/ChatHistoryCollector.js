/**
 * ChatHistoryCollector — gathers chat messages for chat-style analysis.
 *
 * Extends BaseCollector. Reads recent chat turns from an injected
 * chatHistoryRepository. The repository may expose recent(limit) or be a
 * plain function; both are accepted. Each turn is projected to evidence:
 * { type:'chat', role, content, createdAt }.
 *
 * Pure domain logic: tolerates legacy field names (created_at / text).
 */

import { BaseCollector } from './BaseCollector.js';

const DEFAULT_LIMIT = 100;

function normalizeChatRecord(record) {
  if (!record) return null;
  return {
    role: record.role || null,
    content: record.content || record.text || record.message || null,
    createdAt: record.createdAt || record.created_at || record.timestamp || null,
  };
}

export class ChatHistoryCollector extends BaseCollector {
  /**
   * @param {Object}  [opts]
   * @param {string}  [opts.name]
   * @param {Object}  [opts.eventBus]
   * @param {number}  [opts.limit=100]
   */
  constructor({ name, eventBus, limit } = {}) {
    super({ name, eventBus });
    this.limit = limit || DEFAULT_LIMIT;
  }

  /**
   * @param {Object} sources
   * @param {Object|Function} [sources.chatHistoryRepository]
   * @returns {Promise<{evidence:Array, count:number}>}
   */
  async collect({ chatHistoryRepository } = {}) {
    const history = await this._fetchChatHistory(chatHistoryRepository);

    const evidence = history
      .map(normalizeChatRecord)
      .filter(Boolean)
      .map((record) => ({
        type: 'chat',
        role: record.role,
        content: record.content,
        createdAt: record.createdAt,
      }));

    this.emit('collection:completed', { evidenceCount: evidence.length });

    return { evidence, count: evidence.length };
  }

  async _fetchChatHistory(repo) {
    if (!repo) return [];
    let result;
    if (typeof repo.recent === 'function') result = repo.recent(this.limit);
    else if (typeof repo === 'function') result = repo(this.limit);
    else return [];
    return (await result) || [];
  }
}
