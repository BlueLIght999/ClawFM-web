import OpenAI from 'openai';
import config from '../../config.js';
import { isLlmConfigured } from '../../domain/hosting/isLlmConfigured.js';

/**
 * Shared DeepSeek LLM client (composition-root wiring, infrastructure layer).
 * Single instance reused by claude.js and planner.js — replaces the two
 * previously-duplicated `new OpenAI(...)` blocks (CODING-STYLE 1.5).
 *
 * The configured/not-configured decision is the already-tested
 * isLlmConfigured predicate; when unconfigured the client is null and
 * callers fall back gracefully (R1 never-silent).
 */
export const llmClient = isLlmConfigured(config.deepseekApiKey)
  ? new OpenAI({ apiKey: config.deepseekApiKey, baseURL: config.deepseekBaseUrl })
  : null;
