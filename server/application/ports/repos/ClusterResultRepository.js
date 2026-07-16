/**
 * @typedef {object} ClusterResultRepository
 * @property {(result: ClusterResultDO) => void} save — 保存聚类结果
 * @property {() => Promise<ClusterResult[]>} latest — 获取最近的聚类结果
 */
export {};
