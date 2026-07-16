export const EVENTS = {
  // Server -> Client
  RADIO_STATE: 'radio:state',
  SONG_CHANGE: 'radio:song-change',
  DJ_MESSAGE: 'radio:dj-message',
  DJ_SPEECH_START: 'radio:dj-speech-start',
  DJ_SPEECH_END: 'radio:dj-speech-end',
  DJ_STREAM_CHUNK: 'radio:dj-stream-chunk',
  DJ_STREAM_END: 'radio:dj-stream-end',
  QUEUE_UPDATE: 'radio:queue-update',
  PLAYBACK_POSITION: 'radio:playback-position',
  PAUSE: 'radio:pause',
  RESUME: 'radio:resume',
  LOGIN_REQUIRED: 'radio:login-required',
  ERROR: 'radio:error',
  CRAB_ANIMATION: 'crab:animation',
  SYNC_TIME: 'sync:time',
  PLAN_UPDATE: 'plan:update',

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
};
