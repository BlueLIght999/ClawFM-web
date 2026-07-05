/**
 * @typedef {object} SpeechSynthHealth
 * @property {boolean|null} available
 * @property {string|null} provider
 * @property {string} reason
 */

/**
 * @typedef {object} SpeechSynthPort
 * @property {(text: string) => Promise<string|null>} synthesize
 * @property {() => SpeechSynthHealth} health
 */

export {};
