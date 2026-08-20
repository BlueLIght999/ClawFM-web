export const EVENTS = {
  // Server -> Client
  RADIO_STATE: 'radio:state',
  RADIO_STATE_V2: 'radio:state-v2',
  SONG_CHANGE: 'radio:song-change',
  SONG_CHANGE_V2: 'radio:song-change-v2',
  DJ_MESSAGE: 'radio:dj-message',
  DJ_SPEECH_START: 'radio:dj-speech-start',
  DJ_SPEECH_END: 'radio:dj-speech-end',
  DJ_STREAM_START: 'radio:dj-stream-start',
  DJ_STREAM_CHUNK: 'radio:dj-stream-chunk',
  DJ_STREAM_END: 'radio:dj-stream-end',
  QUEUE_UPDATE: 'radio:queue-update',
  QUEUE_UPDATE_V2: 'radio:queue-update-v2',
  PLAYBACK_POSITION: 'radio:playback-position',
  PAUSE: 'radio:pause',
  RESUME: 'radio:resume',
  LOGIN_REQUIRED: 'radio:login-required',
  ERROR: 'radio:error',
  CRAB_ANIMATION: 'crab:animation',
  SYNC_TIME: 'sync:time',
  PLAN_UPDATE: 'plan:update',
  CHAT_HISTORY: 'chat:history',

  // Profile system events (Server -> Client)
  PROFILE_UPDATED: 'profile:updated',
  PROFILE_ANALYSIS: 'profile:analysis',
  PROFILE_CLUSTER: 'profile:cluster',
  PROFILE_TAGS: 'profile:tags',

  // Client -> Server
  PLAYER_SKIP: 'player:skip',
  PLAYER_PREVIOUS: 'player:previous',
  PLAYER_PAUSE: 'player:pause',
  PLAYER_RESUME: 'player:resume',
  PLAYER_SEEK: 'player:seek',
  PLAYER_SET_MODE: 'player:set-mode',
  PLAYER_PROGRESS: 'player:progress',
  CHAT_MESSAGE: 'chat:message',
  CHAT_TYPING: 'chat:typing',
  CRAB_CLICK: 'crab:click',
  CRAB_BUBBLE_CLICK: 'crab:bubble-click',
  AUTH_LOGIN_PHONE: 'auth:login-phone',
  AUTH_LOGIN_QR_START: 'auth:login-qr-start',
  AUTH_LOGOUT: 'auth:logout',
  SONG_LIKE: 'song:like',
  SONG_REQUEST: 'song:request',

  // Bubble system (Server -> Client)
  CRAB_BUBBLES: 'crab:bubbles',

  // Community module (PRD v0.3) ───────────────────────────────
  // Server -> Client
  COMMUNITY_PUSH: 'community:push',             // Agent 分发推送（帖子/歌单/歌曲）
  COMMUNITY_CLUSTER_UPDATED: 'community:cluster-updated',
  COMMUNITY_POST_NEW: 'community:post-new',     // 动态时间线新帖
  COMMUNITY_AGENT_COMMENT: 'community:agent-comment', // agent 代发评论（带署名）
  COMMUNITY_COMMENT_NEW: 'community:comment-new', // 有人评论了我的帖子（定向）
  COMMUNITY_FOLLOW: 'community:follow',         // 有人关注了我（定向）
  COMMUNITY_INVITATION: 'community:invitation', // 收到邀请
  COMMUNITY_DM_NEW: 'community:dm-new',         // 收到新私信 / agent 私信（定向）
  ROOM_STATE: 'room:state',                     // 一起听房间状态（房主播放同步）
  ROOM_CHAT: 'room:chat',                       // 房间内聊天（双向）
  ROOM_SYNC: 'room:sync',                       // 播放位置同步
  // Client -> Server
  COMMUNITY_IDENTIFY: 'community:identify',       // 成员登录后绑定 socket 到 user:<uid> room
  ROOM_JOIN: 'room:join',
  ROOM_LEAVE: 'room:leave',
  ROOM_SKIP: 'room:skip',                       // 房主切歌
};
