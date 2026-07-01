/**
 * Pure predicate: is the LLM configured?
 * True when an API key exists and is not the placeholder 'sk-xxx'.
 *
 * Extracted from the duplicated client-init condition in claude.js/planner.js
 * so a shared LLM client factory can reuse one tested decision.
 */
export function isLlmConfigured(apiKey) {
  return !!apiKey && apiKey !== 'sk-xxx';
}
