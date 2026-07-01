/**
 * Pure user-corpus formatting — no fs, no IO.
 * Extracted from services/context.js slotUserCorpus so file reading moves to
 * infrastructure and context.js stops importing fs (arch rule D2 / warn removal).
 *
 * Joins non-empty sections as markdown, separated by blank lines.
 */
export function formatUserCorpus({ taste = '', routines = '', moodRules = '' } = {}) {
  return [
    taste ? `## User Taste\n${taste}` : '',
    routines ? `## User Routines\n${routines}` : '',
    moodRules ? `## Mood Rules\n${moodRules}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}
