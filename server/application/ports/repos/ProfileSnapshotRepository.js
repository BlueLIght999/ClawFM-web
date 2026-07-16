/**
 * @typedef {object} ProfileSnapshotRepository
 * @property {(profile: object, schemaVersion: number) => void} save — 保存画像快照
 * @property {(limit: number) => Promise<ProfileSnapshot[]>} recent — 获取最近的快照
 * @property {() => Promise<ProfileSnapshot|null>} latest — 获取最新快照
 */
export {};
