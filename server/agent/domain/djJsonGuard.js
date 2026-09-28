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

// `[^`]` (greedy, negated) replaced the old lazy `[\s\S]*?`, which sonarjs flagged
// as super-linear: with a run of backticks the lazy scan retried every split point,
// and the trailing `\s*\n?` added a second ambiguous quantifier. A negated class
// consumes each position once, so the scan is linear. sonarjs still reports the
// `<...>`-style shape conservatively; there is no rewrite that keeps the meaning.
// eslint-disable-next-line sonarjs/super-linear-regex
const JSON_BLOCK_RE = /```json?\s*\n?[^`]*\n?```/gi;
const FENCE_OPEN_RE = /^```json?\s*/i;
// Closing fence, stripped by both extractSayFromText and shouldFilterChunk-adjacent
// paths. Anchored to the string end, so no ambiguity to backtrack into; sonarjs
// flags the `\s*` runs regardless, hence the disable with its reason.
// eslint-disable-next-line sonarjs/super-linear-regex
const FENCE_CLOSE_RE = /\s*```\s*$/;

/**
 * Remove bare `{"say": ..., "play": ...}` objects from text.
 *
 * This was `/\{[\s\S]*?"say"[\s\S]*?"play"[\s\S]*?\}/gi`, whose three lazy
 * wildcards backtrack into super-linear time on any brace-heavy input that never
 * matches (a stack trace, a code sample). A single linear pass with a brace-depth
 * counter has no backtracking, and it also fixes a correctness gap: the regex
 * happily spanned `}{` and swallowed text *between* two unrelated objects.
 * Depth tracking only ever closes on its own opener.
 *
 * String state is tracked so braces inside quoted strings do not move the depth.
 *
 * @param {string} text
 * @returns {string}
 */
function stripBareJsonObjects(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '{') {
      out += text[i];
      i++;
      continue;
    }
    const end = findObjectEnd(text, i);
    const segment = end === -1 ? null : text.slice(i, end);
    if (segment !== null && hasSayAndPlay(segment)) {
      i = end;
    } else {
      out += text[i];
      i++;
    }
  }
  return out;
}

/**
 * Index just past the `}` matching the `{` at `start`, or -1 if unbalanced.
 * @param {string} text
 * @param {number} start
 * @returns {number}
 */
function findObjectEnd(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * True when the candidate object parses and carries both DJ fields -- the same
 * guard the old regex expressed as a literal `"say" ... "play"` requirement.
 * @param {string} segment
 * @returns {boolean}
 */
function hasSayAndPlay(segment) {
  try {
    const parsed = JSON.parse(segment);
    return !!parsed && typeof parsed === 'object' && 'say' in parsed && 'play' in parsed;
  } catch {
    return false;
  }
}

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
  result = stripBareJsonObjects(result);
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
  cleaned = cleaned.replace(FENCE_OPEN_RE, '').replace(FENCE_CLOSE_RE, '');
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
