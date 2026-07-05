/**
 * @typedef {{role: 'system'|'user'|'assistant', content: string}} LlmMessage
 *
 * @typedef {object} LlmOptions
 * @property {number=} maxTokens
 * @property {number=} temperature
 * @property {boolean=} jsonMode
 *
 * @typedef {object} LlmPort
 * @property {(messages: LlmMessage[], opts?: LlmOptions) => Promise<string|null>} complete
 * @property {(messages: LlmMessage[], opts?: LlmOptions, onToken?: (token: string) => void) => Promise<string|null>} stream
 * @property {() => boolean} isConfigured
 */

export {};
