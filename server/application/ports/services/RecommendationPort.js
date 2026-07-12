/**
 * @typedef {object} PlanBlock
 * @property {string} id
 * @property {string} label
 * @property {boolean} pinned
 *
 * @typedef {object} RecommendationPort
 * @property {string|null} uid — authenticated user ID
 * @property {() => Promise<void>} fillQueue — fill the queue with recommended songs
 * @property {(blocks: PlanBlock[]) => void} setPlanBlocks — update plan blocks for recommendation hints
 */

export {};
