const SOFT_SKIP_WINDOW_MS = 15000;
const FEEDBACK_WINDOW_MS = 60000;
const OVER_CONSERVATIVE_REFUSAL_RATE = 0.3;

export const BAD_CASE_LAYERS = {
  HARD: 'hard',
  SOFT: 'soft',
  BOUNDARY: 'boundary',
};

/**
 * Turns observable product events into bad-case attribution chains.
 * The function stays pure so offline samples and future telemetry can share the same rules.
 */
export function attributeBadCases(sessions, options = {}) {
  const normalizedSessions = normalizeSessions(sessions);
  const config = {
    softSkipWindowMs: options.softSkipWindowMs ?? SOFT_SKIP_WINDOW_MS,
    feedbackWindowMs: options.feedbackWindowMs ?? FEEDBACK_WINDOW_MS,
    overConservativeRefusalRate:
      options.overConservativeRefusalRate ?? OVER_CONSERVATIVE_REFUSAL_RATE,
  };
  const cases = normalizedSessions.flatMap((session) => [
    ...hardBadCases(session),
    ...softBadCases(session, config),
    ...boundaryBadCases(session, config),
  ]);

  return {
    summary: summarizeCases(cases),
    cases,
  };
}

function hardBadCases(session) {
  return [
    ...entityMismatchCases(session),
    ...directHardEventCases(session, 'safety_violation', 'safety_violation', 'safety_policy_gap'),
    ...directHardEventCases(session, 'format_parse_failed', 'format_broken', 'response_contract_broken'),
    ...wrongfulRefusalCases(session),
  ];
}

function entityMismatchCases(session) {
  return session.events
    .filter(hasEntityMismatch)
    .map((event) =>
      makeCase(session, event, {
        layer: BAD_CASE_LAYERS.HARD,
        type: 'entity_mismatch',
        action: actionForEvent(event),
        signal: 'entity_mismatch',
        rootCause: 'music_entity_mapping_error',
        evidence: {
          expectedArtist: event.expectedArtist,
          actualArtist: event.actualArtist,
          songId: event.songId ?? null,
        },
      })
    );
}

function directHardEventCases(session, eventType, badType, rootCause) {
  return session.events
    .filter((event) => event.type === eventType)
    .map((event) =>
      makeCase(session, event, {
        layer: BAD_CASE_LAYERS.HARD,
        type: badType,
        action: actionForEvent(event),
        signal: eventType,
        rootCause,
        evidence: event.evidence ?? {},
      })
    );
}

function wrongfulRefusalCases(session) {
  return session.events
    .filter((event) => event.type === 'response_refused' && event.shouldAnswer === true)
    .map((event) =>
      makeCase(session, event, {
        layer: BAD_CASE_LAYERS.HARD,
        type: 'wrongful_refusal',
        action: 'answer_user',
        signal: 'answerable_refusal',
        rootCause: 'refusal_policy_misfire',
        evidence: { canAnswer: event.canAnswer === true },
      })
    );
}

function softBadCases(session, config) {
  return session.events
    .filter(isRecommendationEvent)
    .filter((event) => hasSkipAndFeedback(session.events, event, config))
    .map((event) =>
      makeCase(session, event, {
        layer: BAD_CASE_LAYERS.SOFT,
        type: 'recommendation_mismatch',
        action: 'recommend_song',
        signal: 'skip_plus_negative_feedback',
        rootCause: 'preference_alignment_gap',
        evidence: {
          songId: event.songId ?? null,
          requestedMood: event.requestedMood ?? null,
          songMood: event.songMood ?? null,
          skipWindowMs: config.softSkipWindowMs,
          feedbackWindowMs: config.feedbackWindowMs,
        },
      })
    );
}

function boundaryBadCases(session, config) {
  const overConservative = overConservativeCase(session, config);
  return overConservative ? [overConservative] : [];
}

function overConservativeCase(session, config) {
  const safeQuestions = session.events.filter(
    (event) => event.type === 'user_intent_submitted' && event.safe === true
  );
  const answerableRefusals = session.events.filter(
    (event) => event.type === 'response_refused' && event.canAnswer === true
  );
  const refusalRate = safeQuestions.length > 0 ? round(answerableRefusals.length / safeQuestions.length) : 0;

  if (refusalRate <= config.overConservativeRefusalRate) {
    return null;
  }
  return makeCase(session, answerableRefusals[0], {
    layer: BAD_CASE_LAYERS.BOUNDARY,
    type: 'over_conservative',
    action: 'answer_user',
    signal: 'safe_refusal_rate_high',
    rootCause: 'safety_threshold_too_strict',
    evidence: {
      safeQuestions: safeQuestions.length,
      answerableRefusals: answerableRefusals.length,
      refusalRate,
      threshold: config.overConservativeRefusalRate,
    },
  });
}

function makeCase(session, event, detail) {
  const badCase = {
    id: `${session.id}:${detail.type}:${normalizeTime(event?.at)}`,
    sessionId: session.id,
    at: normalizeTime(event?.at),
    layer: detail.layer,
    type: detail.type,
    action: detail.action,
    rootCause: detail.rootCause,
    evidence: detail.evidence,
  };
  return {
    ...badCase,
    attributionChain: buildAttributionChain(badCase, detail.signal),
  };
}

function buildAttributionChain(badCase, signal) {
  return [
    { stage: 'action', label: badCase.action },
    { stage: 'signal', label: signal },
    { stage: 'classification', label: badCase.layer },
    { stage: 'rootCause', label: badCase.rootCause },
  ];
}

function summarizeCases(cases) {
  return {
    totalCases: cases.length,
    byLayer: countBy(cases, 'layer', Object.values(BAD_CASE_LAYERS)),
    byAction: countBy(cases, 'action'),
    byRootCause: countBy(cases, 'rootCause'),
  };
}

function countBy(items, key, initialKeys = []) {
  const initial = Object.fromEntries(initialKeys.map((itemKey) => [itemKey, 0]));
  return items.reduce((counts, item) => {
    counts[item[key]] = (counts[item[key]] ?? 0) + 1;
    return counts;
  }, initial);
}

function hasEntityMismatch(event) {
  return (
    event.type === 'recommended_song_added' &&
    Boolean(event.expectedArtist) &&
    Boolean(event.actualArtist) &&
    normalizeText(event.expectedArtist) !== normalizeText(event.actualArtist)
  );
}

function hasSkipAndFeedback(events, recommendation, config) {
  const skip = events.find((event) => isSongSkipFor(event, recommendation, config.softSkipWindowMs));
  if (!skip) {
    return false;
  }
  return events.some((event) => isNegativeFeedbackFor(event, recommendation, config.feedbackWindowMs));
}

function isSongSkipFor(event, recommendation, windowMs) {
  return (
    event.type === 'song_skipped' &&
    sameSong(event, recommendation) &&
    normalizeTime(event.at) >= normalizeTime(recommendation.at) &&
    normalizeTime(event.at) <= normalizeTime(recommendation.at) + windowMs
  );
}

function isNegativeFeedbackFor(event, recommendation, windowMs) {
  return (
    event.type === 'user_negative_feedback' &&
    sameSong(event, recommendation) &&
    normalizeTime(event.at) >= normalizeTime(recommendation.at) &&
    normalizeTime(event.at) <= normalizeTime(recommendation.at) + windowMs
  );
}

function sameSong(event, recommendation) {
  return !event.targetSongId || !recommendation.songId || event.targetSongId === recommendation.songId;
}

function isRecommendationEvent(event) {
  return ['recommended_song_added', 'recommendation_added'].includes(event.type);
}

function actionForEvent(event) {
  if (isRecommendationEvent(event)) {
    return 'recommend_song';
  }
  return event.action ?? 'answer_user';
}

function normalizeSessions(sessions) {
  return sessions.map((session, index) => ({
    id: session.id ?? `session-${index + 1}`,
    events: [...(session.events ?? [])].sort((a, b) => normalizeTime(a.at) - normalizeTime(b.at)),
  }));
}

function normalizeText(value) {
  return String(value).trim().toLowerCase();
}

function normalizeTime(value) {
  return Number.isFinite(value) ? value : 0;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
