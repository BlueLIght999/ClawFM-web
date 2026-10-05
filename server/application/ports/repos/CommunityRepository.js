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
 * @typedef {object} CommunityInvitation
 * @property {number} id
 * @property {string} fromUserId
 * @property {string} toUserId
 * @property {string} contextType
 * @property {string|null} contextId
 * @property {string} status
 * @property {string} createdAt
 *
 * @typedef {object} CommunityRepository
 * @property {(m: {userId:string, nickname:string, avatarUrl:string}) => CommunityMember|null} createMember
 * @property {(userId: string) => CommunityMember|null} getMember
 * @property {(userId: string, patch: {nickname:string, avatarUrl:string}) => CommunityMember|null} updateMemberProfile - 更新昵称/头像 URL
 * @property {(userId: string, binary: Uint8Array, mimeType: string) => CommunityMember|null} saveAvatar - 存上传头像二进制，并把 avatarUrl 指向取图路由
 * @property {(userId: string) => {avatar_binary: Uint8Array|null, avatar_mime: string|null}|null} getAvatarBinary - 取上传头像二进制与 MIME
 * @property {(userId: string) => void} touchMemberActive
 * @property {(userId: string, clusterId: number) => void} setMemberCluster
 * @property {(userId: string, selfTags: string[]) => void} setMemberSelfTags
 * @property {(a: {userId:string, neteaseUid:string, cookieEncrypted:string}) => void} upsertMemberAuth
 * @property {(userId: string) => {userId:string, neteaseUid:string, cookieEncrypted:string, fetchedAt:string|null}|null} getMemberAuth
 * @property {(userId: string) => void} touchMemberAuthFetched
 * @property {(l: {userId:string, songId:string, title:string, artist:string, action:string}) => void} recordListen
 * @property {(userId: string, songId: string, action: string) => boolean} hasListenAction - 该成员是否对该歌记过这个动作（点赞幂等用）
 * @property {(p: object) => number} createPost
 * @property {(id: number) => CommunityPost|null} getPost
 * @property {(opts: {limit:number, cursor:number|null}) => CommunityPost[]} listFeed
 * @property {(parentId: number) => CommunityPost[]} listComments
 * @property {(id: number) => void} likePost
 * @property {(userId: string, limit: number) => {action:string, artist:string, playedAt:string}[]} listListensByUser
 * @property {(userId: string, profile: object) => void} saveProfile
 * @property {(userId: string) => object|null} getProfile
 * @property {() => {userId:string, profile:object}[]} listAllProfiles
 * @property {() => Array<{userId:string, nickname:string, avatarUrl:string, tags:string[]}>} listMembersWithTags - 全体成员的公开字段 + 自填标签，供相似成员召回建倒排索引；与 listAllProfiles 的分工见实现处注释
 * @property {(clusters: Array) => void} saveClusterSnapshot
 * @property {(clusters: Array, memberAssignments: Record<string, number>) => void} [saveClusterResult] 原子写入快照+成员归属（可选；缺省时服务回落为 saveClusterSnapshot + setMemberCluster）
 * @property {() => Array} getClusterSnapshot
 * @property {(clusterId: number) => CommunityMember[]} listClusterMembers
 * @property {(entry: {userId:string, targetType:string, targetId:string, fromCluster:number|null, reason:string|null, summary?:string|null}) => number} createInbox
 * @property {(userId: string) => Array} listInbox
 * @property {(userId: string, targetType: string, targetId: string) => boolean} hasInboxRecently
 * @property {(userId: string) => {userId:string, rules:object, personaSnapshot:string|null}|null} getMemberAgentConfig
 * @property {(userId: string, rules: object, personaSnapshot: string|null) => void} upsertMemberAgentConfig
 * @property {(inv: {fromUserId:string, toUserId:string, contextType:string, contextId:string|null, status:string}) => CommunityInvitation} createInvitation - 返回落库后的完整邀请行；调用方（InvitationService.invite）直接展开它构造响应，声明成 number 会与实现矛盾
 * @property {(id: number) => CommunityInvitation|null} getInvitation
 * @property {(userId: string) => Array} listInvitations
 * @property {(id: number, status: string) => void} updateInvitationStatus
 * @property {(room: {roomId:string, hostUserId:string, name:string, topicTags:string[]}) => object} createRoom
 * @property {(roomId: string) => object|null} getRoom
 * @property {(activeOnly: boolean) => Array} listRooms
 * @property {(roomId: string) => void} endRoom
 *
 * ── 社交关系（点赞记录 + 关注图谱 + timeline） ──
 * @property {(userId: string, postId: number) => {liked:boolean, likes:number}|null} toggleLike - 切换点赞状态，同步 posts.likes 计数；post 不存在返回 null
 * @property {(userId: string, postId: number) => boolean} hasLiked
 * @property {(postId: number) => CommunityMember[]} listLikers - 点赞者成员信息（不含敏感字段）
 * @property {(followerId: string, followeeId: string) => {ok:boolean, following:boolean}} follow - 幂等关注
 * @property {(followerId: string, followeeId: string) => {ok:boolean, following:boolean}} unfollow - 幂等取关
 * @property {(followerId: string, followeeId: string) => boolean} isFollowing
 * @property {(userId: string) => CommunityMember[]} listFollowers - 谁 follow 了此用户
 * @property {(userId: string) => CommunityMember[]} listFollowing - 此用户 follow 了谁
 * @property {(userId: string, opts: {limit:number, cursor:number|null}) => CommunityPost[]} listPostsByUser - 用户主页 timeline（仅顶层帖）
 * @property {(userId: string, opts: {limit:number, cursor:number|null}) => CommunityPost[]} listFeedFromFollowing - 关注流（关注者的顶层帖）
 *
 * ── 私信 / agent 私信（DM） ──
 * @property {(t: {userA:string, userB:string, agentAuthorUserId:string|null}) => object} getOrCreateDmThread - 规范序唯一键 upsert
 * @property {(id: number) => object|null} getDmThread
 * @property {(userId: string) => Array} listDmThreads - 我的会话 + lastMessage/unread
 * @property {(threadId: number, limit?: number) => Array} listDmMessages
 * @property {(m: {threadId:number, senderUserId:string, isAgent:boolean, content:string}) => number} createDmMessage
 * @property {(id: number) => object|null} getDmMessage
 * @property {(threadId: number) => void} touchDmThreadLastMessage
 */

export {};
