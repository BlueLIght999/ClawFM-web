import { llmClient } from '../../infrastructure/llm/llmClient.js';
import config from '../../config.js';

/**
 * DeepSeek function-calling adapter implementing FunctionCallingPort.
 *
 * Uses the OpenAI-compatible DeepSeek API to send messages with tool
 * definitions and receive tool-call decisions from the LLM.
 *
 * @param {{client?: object|null, model?: string}=} deps
 * @returns {{completeWithTools: Function, isConfigured: Function}}
 */
export function createDeepSeekFunctionCallingAdapter({
  client = llmClient,
  model = config.deepseekModel,
} = {}) {
  /**
   * Send messages with tool definitions to the LLM.
   *
   * @param {{messages: Array, tools: Array<{name: string, description: string, parameters: object}>, maxTokens?: number, temperature?: number}} request
   * @returns {Promise<{content: string|null, toolCalls: Array<{name: string, arguments: object}>}|null>}
   */
  async function completeWithTools({
    messages,
    tools,
    maxTokens = 300,
    temperature = 0.75,
  }) {
    if (!client) return null;
    try {
      const response = await client.chat.completions.create({
        model,
        messages,
        tools: tools.map(t => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        })),
        max_tokens: maxTokens,
        temperature,
        stream: false,
      });

      const message = response.choices?.[0]?.message;
      if (!message) return null;

      const toolCalls = (message.tool_calls || []).map(tc => ({
        name: tc.function?.name || '',
        arguments: safeParseArgs(tc.function?.arguments),
      }));

      return {
        content: message.content || null,
        toolCalls,
      };
    } catch {
      return null;
    }
  }

  return {
    completeWithTools,
    isConfigured: () => !!client,
  };
}

function safeParseArgs(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export const deepSeekFunctionCallingAdapter = createDeepSeekFunctionCallingAdapter();
