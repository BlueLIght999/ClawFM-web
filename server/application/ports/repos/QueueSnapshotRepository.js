/**
 * @typedef {object} QueueState
 * @property {object[]} past
 * @property {object|null} current
 * @property {object[]} future
 * @property {'sequential'|'shuffle'|'fm'} mode
 * @property {number} version
 */

/**
 * @typedef {object} QueueSnapshotRepository
 * @property {(state: QueueState) => void} save
 * @property {() => QueueState|null} latest
 */

export {};
