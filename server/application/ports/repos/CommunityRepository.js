/**
 * CommunityRepository — 社区持久化 Port（application 层接口契约）。
 * 实现见 infrastructure/persistence/repositories/SqliteCommunityRepository.js。
 *
 * @typedef {object} CommunityMember
 * @property {string} userId
 * @property {string} nickname
 * @property {string} avatarUrl
 * @property {string} joinedAt
 * @property {string|null} lastActiveAt
 * @property {number|null} clusterId
 * @property {string[]} selfTags
 *
 * @typedef {object} CommunityPost
 * @property {number} id
 * @property {string} userId
 * @property {string} type
 * @property {number|null} parentId
 * @property {string} content
 * @property {string|null} songId
 * @property {string|null} playlistId
 * @property {string[]} autoTags
 * @property {number} likes
 * @property {boolean} isAgent
 * @property {string|null} agentAuthorUserId
 * @property {string} createdAt
 *
 * @typedef {object} CommunityRepository
 * @property {(m: {userId:string, nickname:string, avatarUrl:string}) => CommunityMember|null} createMember
 * @property {(userId: string) => CommunityMember|null} getMember
 * @property {(userId: string) => void} touchMemberActive
 * @property {(userId: string, clusterId: number) => void} setMemberCluster
 * @property {(userId: string, selfTags: string[]) => void} setMemberSelfTags
 * @property {(a: {userId:string, neteaseUid:string, cookieEncrypted:string}) => void} upsertMemberAuth
 * @property {(userId: string) => {userId:string, neteaseUid:string, cookieEncrypted:string, fetchedAt:string|null}|null} getMemberAuth
 * @property {(userId: string) => void} touchMemberAuthFetched
 * @property {(l: {userId:string, songId:string, title:string, artist:string, action:string}) => void} recordListen
 * @property {(p: object) => number} createPost
 * @property {(id: number) => CommunityPost|null} getPost
 * @property {(opts: {limit:number, cursor:number|null}) => CommunityPost[]} listFeed
 * @property {(parentId: number) => CommunityPost[]} listComments
 * @property {(id: number) => void} likePost
 * @property {(userId: string, limit: number) => {action:string, artist:string, playedAt:string}[]} listListensByUser
 * @property {(userId: string, profile: object) => void} saveProfile
 * @property {(userId: string) => object|null} getProfile
 * @property {() => {userId:string, profile:object}[]} listAllProfiles
 * @property {(clusters: Array) => void} saveClusterSnapshot
 * @property {() => Array} getClusterSnapshot
 * @property {(clusterId: number) => CommunityMember[]} listClusterMembers
 * @property {(entry: {userId:string, targetType:string, targetId:string, fromCluster:number|null, reason:string|null}) => number} createInbox
 * @property {(userId: string) => Array} listInbox
 * @property {(userId: string, targetType: string, targetId: string) => boolean} hasInboxRecently
 * @property {(userId: string) => {userId:string, rules:object, personaSnapshot:string|null}|null} getMemberAgentConfig
 * @property {(userId: string, rules: object, personaSnapshot: string|null) => void} upsertMemberAgentConfig
 * @property {(inv: {fromUserId:string, toUserId:string, contextType:string, contextId:string|null, status:string}) => number} createInvitation
 * @property {(id: number) => object|null} getInvitation
 * @property {(userId: string) => Array} listInvitations
 * @property {(id: number, status: string) => void} updateInvitationStatus
 * @property {(room: {roomId:string, hostUserId:string, name:string, topicTags:string[]}) => object} createRoom
 * @property {(roomId: string) => object|null} getRoom
 * @property {(activeOnly: boolean) => Array} listRooms
 * @property {(roomId: string) => void} endRoom
 *
 * ── 社交关系（点赞记录 + 关注图谱 + timeline） ──
 * @property {(userId: string, postId: number) => {liked:boolean, likes:number}|null} toggleLike — 切换点赞状态，同步 posts.likes 计数；post 不存在返回 null
 * @property {(userId: string, postId: number) => boolean} hasLiked
 * @property {(postId: number) => CommunityMember[]} listLikers — 点赞者成员信息（不含敏感字段）
 * @property {(followerId: string, followeeId: string) => {ok:boolean, following:boolean}} follow — 幂等关注
 * @property {(followerId: string, followeeId: string) => {ok:boolean, following:boolean}} unfollow — 幂等取关
 * @property {(followerId: string, followeeId: string) => boolean} isFollowing
 * @property {(userId: string) => CommunityMember[]} listFollowers — 谁 follow 了此用户
 * @property {(userId: string) => CommunityMember[]} listFollowing — 此用户 follow 了谁
 * @property {(userId: string, opts: {limit:number, cursor:number|null}) => CommunityPost[]} listPostsByUser — 用户主页 timeline（仅顶层帖）
 * @property {(userId: string, opts: {limit:number, cursor:number|null}) => CommunityPost[]} listFeedFromFollowing — 关注流（关注者的顶层帖）
 */

export {};
