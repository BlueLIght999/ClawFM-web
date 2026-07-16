/**
 * @typedef {object} ProfileQueryPort
 * @property {() => Promise<ListenerProfile>} getCurrentProfile — 获取当前用户画像
 * @property {(days: number) => Promise<ProfileSnapshot[]>} getSnapshots — 获取历史快照
 * @property {() => Promise<Tag[]>} getTopTags — 获取权重最高的标签
 * @property {(dimension: string) => Promise<Tag[]>} getTagsByDimension — 按维度获取标签
 * @property {() => Promise<ClusterResult|null>} getCurrentCluster — 获取当前聚类结果
 * @property {() => Promise<boolean>} isFirstRun — 是否首次运行
 */
export {};
