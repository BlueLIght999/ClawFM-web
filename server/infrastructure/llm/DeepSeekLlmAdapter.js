import config from '../../config.js';
import { llmClient } from './llmClient.js';

function completionParams({ model, messages, maxTokens, temperature, stream, jsonMode = false }) {
  const params = {
    model,
    messages,
    max_tokens: maxTokens,
    temperature,
    stream,
  };
  if (jsonMode) params.response_format = { type: 'json_object' };
  return params;
}

function textFromCompletion(response) {
  return response.choices?.[0]?.message?.content || null;
}

function tokenFromChunk(chunk) {
  return chunk.choices?.[0]?.delta?.content || '';
}

/**
 * Wraps an OpenAI-compatible DeepSeek client behind LlmPort.
 *
 * @param {{client?: object|null, model?: string}=} deps
 */
export function createDeepSeekLlmAdapter({
  client = llmClient,
  model = config.deepseekModel,
} = {}) {
  async function complete(messages, {
    maxTokens = 250,
    temperature = 0.75,
    jsonMode = false,
  } = {}) {
    if (!client) return null;
    try {
      const response = await client.chat.completions.create(completionParams({
        model,
        messages,
        maxTokens,
        temperature,
        stream: false,
        jsonMode,
      }));
      return textFromCompletion(response);
    } catch {
      return null;
    }
  }

  async function stream(messages, {
    maxTokens = 250,
    temperature = 0.75,
  } = {}, onToken) {
    if (!client) return null;
    try {
      const response = await client.chat.completions.create(completionParams({
        model,
        messages,
        maxTokens,
        temperature,
        stream: true,
      }));

      let fullText = '';
      for await (const chunk of response) {
        const token = tokenFromChunk(chunk);
        if (token) {
          fullText += token;
          onToken?.(token);
        }
      }
      return fullText || null;
    } catch {
      return null;
    }
  }

  async function streamRaw(messages, {
    maxTokens = 300,
    temperature = 0.8,
  } = {}) {
    if (!client) return null;
    try {
      return await client.chat.completions.create(completionParams({
        model,
        messages,
        maxTokens,
        temperature,
        stream: true,
      }));
    } catch {
      return null;
    }
  }

  return {
    complete,
    stream,
    streamRaw,
    isConfigured: () => !!client,
  };
}

export const deepSeekLlmAdapter = createDeepSeekLlmAdapter();
