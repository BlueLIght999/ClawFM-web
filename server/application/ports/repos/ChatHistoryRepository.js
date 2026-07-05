/**
 * @typedef {{role: 'user'|'assistant'|string, content: string}} ChatMessage
 *
 * @typedef {object} ChatHistoryRepository
 * @property {(limit: number) => ChatMessage[]} recent
 * @property {(role: string, content: string) => void} append
 */

export {};
