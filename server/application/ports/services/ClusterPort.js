/**
 * @typedef {object} ClusterPort
 * @property {() => Promise<ClusterResult|null>} getCurrentCluster — 获取当前聚类
 * @property {() => Promise<object>} getClusterDistribution — 获取聚类分布
 * @property {(clusterId: string) => Promise<string[]>} findSimilarUsers — [社交预留] 查找相似用户
 * @property {(clusterId: string) => Promise<object>} getClusterRecommendations — [社交预留] 获取聚类推荐
 * @property {(callback: Function) => void} onClusterChange — [社交预留] 监听聚类变化
 * @property {() => object} exportClusterData — [社交预留] 导出聚类数据
 */
export {};
