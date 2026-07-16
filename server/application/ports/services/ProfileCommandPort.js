/**
 * @typedef {object} ProfileCommandPort
 * @property {() => Promise<void>} triggerCollection — 触发数据收集
 * @property {() => Promise<void>} triggerAnalysis — 触发分析
 * @property {() => Promise<void>} triggerFullBuild — 触发首次全量构建
 * @property {(songId: string, title: string, artist: string) => Promise<EnrichmentResult>} enrichSong — 富化歌曲元数据
 */
export {};
