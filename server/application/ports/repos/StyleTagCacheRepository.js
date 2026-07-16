/**
 * @typedef {object} StyleTagCacheRepository
 * @property {(tag: StyleTagDO) => void} upsertTag — 写入标签缓存
 * @property {() => Promise<StyleTag[]>} getAllTags — 获取所有缓存标签
 * @property {(category: string) => Promise<StyleTag[]>} getTagsByCategory — 按分类获取标签
 * @property {(mapping: SongStyleMappingDO) => void} upsertMapping — 写入歌曲-标签映射
 * @property {(songId: string) => Promise<SongStyleMapping[]>} getMappings — 获取歌曲标签映射
 * @property {(limit: number) => Promise<SongStyleMapping[]>} getAllMappings — 获取所有映射
 */
export {};
