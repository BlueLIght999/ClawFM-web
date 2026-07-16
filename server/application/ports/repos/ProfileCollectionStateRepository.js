/**
 * @typedef {object} ProfileCollectionStateRepository
 * @property {(collectorName: string) => Promise<CollectionState|null>} get — 获取收集器状态
 * @property {(collectorName: string, state: object) => void} upsert — 更新收集器状态
 * @property {() => Promise<CollectionState[]>} getAll — 获取所有收集器状态
 */
export {};
