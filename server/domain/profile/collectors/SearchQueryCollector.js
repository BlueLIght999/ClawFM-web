/**
 * SearchQueryCollector — extracts music-search intent from chat messages.
 *
 * Extends BaseCollector. Scans user chat turns for search-like phrasing and
 * projects each match to evidence:
 *   { type:'search', query, extractedKeywords:string[] }
 *
 * A user message is considered search-like when it contains one of the
 * triggers ('听', 'play', 'search' — case-insensitive) OR starts with a
 * common request keyword (想/要/来/换/播/放/搜/给/一首).
 *
 * Keywords are extracted by stripping common particles
 * (的, 了, 一首, 想, 要, 听, 给我) then splitting on whitespace/punctuation.
 * This is naive particle stripping, not full segmentation — intentional for
 * the domain layer. Pure logic; repository is injected.
 */

import { BaseCollector } from './BaseCollector.js';

const DEFAULT_LIMIT = 200;

const SEARCH_TRIGGERS = ['听', 'play', 'search'];
const KEYWORD_STARTERS = ['想', '要', '来', '换', '播', '放', '搜', '给', '一首'];
const PARTICLES = ['的', '了', '一首', '想', '要', '听', '给我'];

function normalizeChatRecord(record) {
  if (!record) return null;
  return {
    role: record.role || null,
    content: record.content || record.text || record.message || null,
    createdAt: record.createdAt || record.created_at || record.timestamp || null,
  };
}

function isSearchLike(content) {
  if (!content || typeof content !== 'string') return false;
  const lower = content.toLowerCase();
  if (SEARCH_TRIGGERS.some((trigger) => lower.includes(trigger))) return true;
  if (KEYWORD_STARTERS.some((starter) => content.startsWith(starter))) return true;
  return false;
}

function extractKeywords(query) {
  if (!query) return [];
  let cleaned = query;
  for (const particle of PARTICLES) {
    cleaned = cleaned.split(particle).join('');
  }
  return cleaned
    .split(/[\s,，。.!！?？、]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

export class SearchQueryCollector extends BaseCollector {
  /**
   * @param {Object}  [opts]
   * @param {string}  [opts.name]
   * @param {Object}  [opts.eventBus]
   * @param {number}  [opts.limit=200]
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

    const userMessages = history
      .map(normalizeChatRecord)
      .filter(Boolean)
      .filter((record) => record.role === 'user');

    const evidence = userMessages
      .filter((record) => isSearchLike(record.content))
      .map((record) => ({
        type: 'search',
        query: record.content,
        extractedKeywords: extractKeywords(record.content),
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
