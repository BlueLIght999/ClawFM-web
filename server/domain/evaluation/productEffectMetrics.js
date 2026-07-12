const STARTUP_TARGET_MS = 30000;
const SILENT_GAP_THRESHOLD_MS = 10000;
const ACCEPTANCE_WINDOW_MS = 60000;

export const PRODUCT_EFFECT_CHAINS = [
  {
    id: 'startup',
    name: 'Smooth startup',
    metricKeys: ['openSuccessRate', 'medianTimeToFirstSongMs', 'coldStartFallbackRate'],
  },
  {
    id: 'playback',
    name: 'Continuous playback',
    metricKeys: ['silentInterruptions', 'nextSongAdvancementRate', 'queueRefillSuccessRate'],
  },
  {
    id: 'djHosting',
    name: 'DJ hosting',
    metricKeys: ['djSpeechStartRate', 'djSpeechCompletionRate', 'djSpeechBlockingRate'],
  },
  {
    id: 'recommendation',
    name: 'Personalized recommendation',
    metricKeys: ['recommendationEnqueueRate', 'recommendationAcceptanceRate', 'recommendationFreshnessRate'],
  },
  {
    id: 'intervention',
    name: 'User intervention',
    metricKeys: ['intentRecognitionHitRate', 'intentActionSuccessRate', 'interventionSatisfactionRate'],
  },
  {
    id: 'dailyPlan',
    name: 'Daily plan',
    metricKeys: ['planGenerationRate', 'planUsageRate', 'planFulfillmentRate'],
  },
  {
    id: 'authAssets',
    name: 'Login and music assets',
    metricKeys: ['loginSuccessRate', 'playlistLoadRate', 'profileReadyRate'],
  },
];

/**
 * Offline product-effect evaluation for session event samples.
 * Keep this pure so real telemetry can be plugged in later without changing metric definitions.
 */
export function evaluateProductEffect(sessions, options = {}) {
  const normalizedSessions = normalizeSessions(sessions);
  const config = {
    startupTargetMs: options.startupTargetMs ?? STARTUP_TARGET_MS,
    silentGapThresholdMs: options.silentGapThresholdMs ?? SILENT_GAP_THRESHOLD_MS,
    acceptanceWindowMs: options.acceptanceWindowMs ?? ACCEPTANCE_WINDOW_MS,
  };

  const chains = {
    startup: buildStartupChain(normalizedSessions, config),
    playback: buildPlaybackChain(normalizedSessions, config),
    djHosting: buildDjHostingChain(normalizedSessions),
    recommendation: buildRecommendationChain(normalizedSessions, config),
    intervention: buildInterventionChain(normalizedSessions, config),
    dailyPlan: buildDailyPlanChain(normalizedSessions),
    authAssets: buildAuthAssetsChain(normalizedSessions),
  };

  return {
    summary: buildSummary(normalizedSessions, chains),
    chains,
  };
}

function buildStartupChain(sessions, config) {
  const pageOpenSessions = countSessionsWith(sessions, 'page_open');
  const firstSongSessions = countSessionsWith(sessions, 'first_song_playing');
  const startupDurations = sessions
    .map((session) => durationBetween(session.events, 'page_open', 'first_song_playing'))
    .filter((duration) => duration !== null);
  const coldStartFailures = countEvents(sessions, 'cold_start_failure');
  const fallbackStarts = countEvents(sessions, 'fallback_started_music');

  return chain('startup', {
    openSuccessRate: rateMetric('Open success rate', firstSongSessions, pageOpenSessions),
    medianTimeToFirstSongMs: durationMetric(
      'Median time to first song',
      median(startupDurations),
      config.startupTargetMs
    ),
    coldStartFallbackRate: rateMetric('Cold-start fallback rate', fallbackStarts, coldStartFailures),
  });
}

function buildPlaybackChain(sessions, config) {
  const songEnded = countEvents(sessions, 'song_ended');
  const nextSongStarted = countEvents(sessions, 'next_song_started');
  const refillStarted = countEvents(sessions, 'queue_refill_started');
  const refillSuccess = countEvents(sessions, 'queue_refill_success');

  return chain('playback', {
    silentInterruptions: countMetric(
      'Silent interruptions',
      countSilentInterruptions(sessions, config.silentGapThresholdMs),
      0
    ),
    nextSongAdvancementRate: rateMetric('Next-song advancement rate', nextSongStarted, songEnded),
    queueRefillSuccessRate: rateMetric('Queue refill success rate', refillSuccess, refillStarted),
  });
}

function buildDjHostingChain(sessions) {
  const requested = countEvents(sessions, 'dj_speech_requested');
  const started = countEvents(sessions, 'dj_speech_started');
  const finished = countEvents(sessions, 'dj_speech_finished');
  const blocked = countEvents(sessions, 'speech_timeout') + countEvents(sessions, 'speech_forced_continue');

  return chain('djHosting', {
    djSpeechStartRate: rateMetric('DJ speech start rate', started, requested),
    djSpeechCompletionRate: rateMetric('DJ speech completion rate', finished, started),
    djSpeechBlockingRate: rateMetric('DJ speech blocking rate', blocked, started, { lowerIsBetter: true }),
  });
}

function buildRecommendationChain(sessions, config) {
  const requests = countEvents(sessions, 'recommendation_request');
  const added = recommendationEvents(sessions);
  const accepted = added.filter((entry) => !hasBlockingEventAfter(entry, config.acceptanceWindowMs, [
    'song_skipped',
    'recommendation_rejected',
    'reject_recommendation',
  ]));
  const fresh = added.filter(({ event }) => event.recent === false || event.isRecent === false);

  return chain('recommendation', {
    recommendationEnqueueRate: rateMetric('Recommendation enqueue rate', added.length, requests),
    recommendationAcceptanceRate: rateMetric('Recommendation acceptance rate', accepted.length, added.length),
    recommendationFreshnessRate: rateMetric('Recommendation freshness rate', fresh.length, added.length),
  });
}

function buildInterventionChain(sessions, config) {
  const submitted = countEvents(sessions, 'user_intent_submitted');
  const valid = countEvents(sessions, 'valid_intent_routed');
  const successes = eventEntries(sessions, 'intent_action_success');
  const satisfied = successes.filter((entry) => !hasBlockingEventAfter(entry, config.acceptanceWindowMs, [
    'reject_recommendation',
    'rollback_recommendation',
    'song_skipped',
    'style_changed',
  ]));

  return chain('intervention', {
    intentRecognitionHitRate: rateMetric('Intent recognition hit rate', valid, submitted),
    intentActionSuccessRate: rateMetric('Intent action success rate', successes.length, valid),
    interventionSatisfactionRate: rateMetric('Intervention satisfaction rate', satisfied.length, successes.length),
  });
}

function buildDailyPlanChain(sessions) {
  const requested = countEvents(sessions, 'plan_requested');
  const generated = countEvents(sessions, 'plan_generated');
  const activeSessions = sessions.filter((session) =>
    session.events.some((event) => ['page_open', 'first_song_playing', 'song_ended'].includes(event.type))
  ).length;
  const selected = countEvents(sessions, 'plan_block_selected');
  const pinned = countEvents(sessions, 'plan_block_pinned');
  const fulfilled = countEvents(sessions, 'queue_refilled_with_plan_block');

  return chain('dailyPlan', {
    planGenerationRate: rateMetric('Plan generation rate', generated, requested),
    planUsageRate: rateMetric('Plan usage rate', selected + pinned, activeSessions),
    planFulfillmentRate: rateMetric('Plan fulfillment rate', fulfilled, selected),
  });
}

function buildAuthAssetsChain(sessions) {
  const loginStarted = countEvents(sessions, 'login_started');
  const loginSuccess = countEvents(sessions, 'login_success');
  const playlistLoaded = countEvents(sessions, 'playlist_loaded');
  const profileReady = countEvents(sessions, 'profile_ready');

  return chain('authAssets', {
    loginSuccessRate: rateMetric('Login success rate', loginSuccess, loginStarted),
    playlistLoadRate: rateMetric('Playlist load rate', playlistLoaded, loginSuccess),
    profileReadyRate: rateMetric('Profile ready rate', profileReady, playlistLoaded),
  });
}

function buildSummary(sessions, chains) {
  const allMetrics = Object.entries(chains).flatMap(([chainId, chainValue]) =>
    Object.entries(chainValue.metrics).map(([metricId, metric]) => ({ chainId, metricId, ...metric }))
  );

  return {
    totalSessions: sessions.length,
    totalChains: Object.keys(chains).length,
    totalMetrics: allMetrics.length,
    attention: allMetrics.filter(needsAttention).map(({ chainId, metricId, label, value }) => ({
      chainId,
      metricId,
      label,
      value,
    })),
  };
}

function needsAttention(metric) {
  if (metric.value === null) {
    return false;
  }
  if (metric.kind === 'count') {
    return metric.lowerIsBetter ? metric.value > metric.target : false;
  }
  if (metric.kind === 'duration') {
    return metric.value > metric.target;
  }
  if (metric.lowerIsBetter) {
    return metric.value > 0.1;
  }
  return metric.value < 0.85;
}

function normalizeSessions(sessions) {
  return sessions.map((session, index) => ({
    id: session.id ?? `session-${index + 1}`,
    events: [...(session.events ?? [])].sort((a, b) => normalizeTime(a.at) - normalizeTime(b.at)),
  }));
}

function chain(id, metrics) {
  const definition = PRODUCT_EFFECT_CHAINS.find((item) => item.id === id);
  return {
    id,
    name: definition.name,
    metrics,
  };
}

function rateMetric(label, numerator, denominator, options = {}) {
  return {
    kind: 'rate',
    label,
    numerator,
    denominator,
    value: denominator > 0 ? round(numerator / denominator) : null,
    lowerIsBetter: Boolean(options.lowerIsBetter),
  };
}

function durationMetric(label, value, target) {
  return {
    kind: 'duration',
    label,
    value,
    target,
    lowerIsBetter: true,
  };
}

function countMetric(label, value, target) {
  return {
    kind: 'count',
    label,
    value,
    target,
    lowerIsBetter: true,
  };
}

function countSessionsWith(sessions, type) {
  return sessions.filter((session) => session.events.some((event) => event.type === type)).length;
}

function countEvents(sessions, type) {
  return eventEntries(sessions, type).length;
}

function eventEntries(sessions, type) {
  return sessions.flatMap((session) =>
    session.events
      .filter((event) => event.type === type)
      .map((event, index) => ({ session, event, index }))
  );
}

function recommendationEvents(sessions) {
  return sessions.flatMap((session) =>
    session.events
      .filter((event) => ['recommended_song_added', 'recommendation_added'].includes(event.type))
      .map((event, index) => ({ session, event, index }))
  );
}

function countSilentInterruptions(sessions, thresholdMs) {
  return sessions.reduce((total, session) => {
    const interruptions = session.events.filter((event, index) => {
      if (event.type !== 'song_ended') {
        return false;
      }
      const nextStart = findNextEvent(session.events, index, 'next_song_started');
      return nextStart ? normalizeTime(nextStart.at) - normalizeTime(event.at) > thresholdMs : false;
    }).length;
    return total + interruptions;
  }, 0);
}

function durationBetween(events, startType, endType) {
  const start = events.find((event) => event.type === startType);
  if (!start) {
    return null;
  }
  const end = events.find(
    (event) => event.type === endType && normalizeTime(event.at) >= normalizeTime(start.at)
  );
  return end ? normalizeTime(end.at) - normalizeTime(start.at) : null;
}

function hasBlockingEventAfter(entry, windowMs, blockingTypes) {
  const startTime = normalizeTime(entry.event.at);
  return entry.session.events.some((event) => {
    const eventTime = normalizeTime(event.at);
    return (
      blockingTypes.includes(event.type) &&
      eventTime >= startTime &&
      eventTime <= startTime + windowMs
    );
  });
}

function findNextEvent(events, startIndex, type) {
  return events.slice(startIndex + 1).find((event) => event.type === type) ?? null;
}

function median(values) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }
  return round((sorted[middle - 1] + sorted[middle]) / 2);
}

function normalizeTime(value) {
  return Number.isFinite(value) ? value : 0;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
