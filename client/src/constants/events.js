/**
 * Socket event name constants — shared between App.jsx and socket event hooks.
 * Single source of truth to prevent event name drift.
 */
export const E = {
  // Radio events
  RADIO_STATE: 'radio:state-v2',
  SONG_CHANGE: 'radio:song-change-v2',
  QUEUE_UPDATE: 'radio:queue-update-v2',
  PLAYBACK_POSITION: 'radio:playback-position',
  PAUSE: 'radio:pause',
  RESUME: 'radio:resume',
  LOGIN_REQUIRED: 'radio:login-required',
  ERROR: 'radio:error',

  // DJ events
  DJ_MESSAGE: 'radio:dj-message',
  DJ_SPEECH_START: 'radio:dj-speech-start',
  DJ_SPEECH_END: 'radio:dj-speech-end',
  DJ_STREAM_CHUNK: 'radio:dj-stream-chunk',
  DJ_STREAM_END: 'radio:dj-stream-end',

  // Crab events
  CRAB_ANIMATION: 'crab:animation',
  CRAB_BUBBLES: 'crab:bubbles',
  CRAB_BUBBLE_CLICK: 'crab:bubble-click',

  // System events
  SYNC_TIME: 'sync:time',
  PLAN_UPDATE: 'plan:update',
};
