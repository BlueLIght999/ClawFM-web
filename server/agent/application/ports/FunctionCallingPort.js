/**
 * @typedef {Object} FunctionCallRequest
 * @property {Array<{role: string, content: string}>} messages - Conversation messages.
 * @property {Array<{name: string, description: string, parameters: object}>} tools - Available tool definitions.
 * @property {number=} maxTokens
 * @property {number=} temperature
 *
 * @typedef {Object} FunctionCallResponse
 * @property {string|null} content - Text content (may be null when only tool calls are returned).
 * @property {Array<{name: string, arguments: object}>} toolCalls - Tool calls requested by the LLM.
 *
 * @typedef {Object} FunctionCallingPort
 * @property {(request: FunctionCallRequest) => Promise<FunctionCallResponse|null>} completeWithTools
 * @property {() => boolean} isConfigured
 */

export {};
