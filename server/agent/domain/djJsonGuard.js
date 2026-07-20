/**
 * djJsonGuard — prevents LLM JSON output from leaking into DJ chat text.
 *
 * Problem: dj-persona.md instructs LLM to "Always respond in JSON structure",
 * but chat mode prompts say "不要输出 JSON". LLM occasionally outputs JSON
 * anyway, and the raw JSON gets displayed to users.
 *
 * This module provides:
 * - stripJsonFromText: remove JSON blocks from mixed text
 * - extractSayFromText: try to extract "say" field from JSON, fallback to text
 * - shouldFilterChunk: detect when a stream token starts JSON output
 */

const JSON_BLOCK_RE = /```json?\s*\n?[\s\S]*?\n?```/gi;
const BARE_JSON_RE = /\{[\s\S]*?"say"[\s\S]*?"play"[\s\S]*?\}/gi;
const FENCE_OPEN_RE = /^```json?\s*/i;

/**
 * Remove JSON code blocks and bare JSON objects from text.
 * Preserves surrounding non-JSON text.
 */
export function stripJsonFromText(text) {
  if (!text) return '';
  let result = text;
  // Remove ```json ... ``` fenced blocks
  result = result.replace(JSON_BLOCK_RE, '');
  // Remove bare { "say": ..., "play": ... } objects
  result = result.replace(BARE_JSON_RE, '');
  // Clean up extra whitespace/newlines left behind
  result = result.replace(/\n{3,}/g, '\n\n').trim();
  return result;
}

/**
 * Try to extract the "say" field from JSON content.
 * If text is valid JSON with a "say" field, return its value.
 * Otherwise return the original text (after stripping JSON fences).
 */
export function extractSayFromText(text) {
  if (!text) return '';
  let cleaned = text.trim();
  // Strip markdown code fences
  cleaned = cleaned.replace(FENCE_OPEN_RE, '').replace(/\s*```\s*$/, '');
  // Try parsing as JSON
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed.say === 'string') {
      return parsed.say;
    }
  } catch {
    // Not valid JSON — return original text (already fence-stripped)
  }
  return cleaned;
}

/**
 * Detect if a streaming chunk token likely starts JSON output.
 * Used to buffer tokens until we can safely extract the say field.
 */
export function shouldFilterChunk(token) {
  if (!token) return false;
  const trimmed = token.trim();
  if (trimmed === '{') return true;
  if (FENCE_OPEN_RE.test(trimmed)) return true;
  return false;
}
