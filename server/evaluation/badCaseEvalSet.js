export const badCaseEvalSet = [
  {
    id: 'hard-entity-mismatch-session',
    description: 'The user asks for one artist, but the recommendation resolves to another artist.',
    events: [
      { type: 'user_intent_submitted', at: 0, text: 'play Jay Chou' },
      {
        type: 'recommended_song_added',
        at: 1000,
        songId: 'bad-artist-1',
        expectedArtist: 'Jay Chou',
        actualArtist: 'JJ Lin',
      },
    ],
  },
  {
    id: 'soft-recommendation-mismatch-session',
    description: 'The user quickly skips a recommendation and explicitly says it is unwanted.',
    events: [
      { type: 'user_intent_submitted', at: 0, text: 'something relaxing' },
      {
        type: 'recommended_song_added',
        at: 800,
        songId: 'too-heavy-1',
        requestedMood: 'relax',
        songMood: 'metal',
      },
      { type: 'song_skipped', at: 9000, songId: 'too-heavy-1' },
      { type: 'user_negative_feedback', at: 15000, targetSongId: 'too-heavy-1', text: 'not this' },
    ],
  },
  {
    id: 'boundary-over-conservative-session',
    description: 'Safe answerable requests are refused too often, making the product feel unusable.',
    events: [
      { type: 'user_intent_submitted', at: 0, safe: true, text: 'tell me about this song' },
      { type: 'response_refused', at: 500, canAnswer: true },
      { type: 'user_intent_submitted', at: 1000, safe: true, text: 'what should I listen to today' },
      { type: 'response_refused', at: 1500, canAnswer: true },
      { type: 'user_intent_submitted', at: 2000, safe: true, text: 'change the vibe' },
      { type: 'intent_action_success', at: 2600 },
    ],
  },
  {
    id: 'hard-format-broken-session',
    description: 'The model returns a malformed control payload.',
    events: [
      { type: 'user_intent_submitted', at: 0, text: 'skip' },
      {
        type: 'format_parse_failed',
        at: 700,
        action: 'route_intent',
        evidence: { expected: 'intent_json', actual: 'truncated_json' },
      },
    ],
  },
];
