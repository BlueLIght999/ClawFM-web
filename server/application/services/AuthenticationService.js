import {
  authLoginStatusFromResult,
  authProfileFromResult,
  authUserIdFromResult,
  qrCreatedPayload,
  qrStatusFromCode,
} from '../../domain/auth/authSessionRules.js';

const INITIAL_RESTORE_QUEUE_SIZE = 15;
const PLAN_UPDATE_EVENT = 'plan:update';

function queueUpdateIfNeeded(queue, songs) {
  if ((songs || []).length > 0 || !queue.isEmpty) {
    return { upcomingSongs: queue.upcomingSongs };
  }
  return null;
}

function cookiePreview(cookie) {
  return cookie || '';
}

async function generateStartupPlan(planner, eventPublisher) {
  try {
    const plan = await planner.generatePlan();
    if (plan) {
      eventPublisher.emit(PLAN_UPDATE_EVENT, plan);
    }
    return { plan, planError: null };
  } catch (e) {
    return { plan: null, planError: e.message };
  }
}

function applyStartupPlan(recommender, plan) {
  const blocks = plan?.blocks || null;
  if (blocks && typeof recommender.setPlanBlocks === 'function') {
    recommender.setPlanBlocks(blocks, plan?.id);
  }
  return blocks;
}

function restoredSessionSummary({ cookie, status, plan, planError, queue, queuePrepared }) {
  return {
    cookieFound: true,
    cookiePreview: cookiePreview(cookie),
    restored: true,
    uid: status.uid,
    planGenerated: !!plan,
    ...(planError ? { planError } : {}),
    queueLength: queue.length,
    queuePrepared,
    currentSongTitle: queue.current?.name || queue.current?.title || null,
  };
}

async function currentStatusPayload(authClient) {
  try {
    const status = authLoginStatusFromResult(await authClient.checkLoginStatus());
    return {
      loggedIn: status.loggedIn,
      profile: status.profile,
    };
  } catch (e) {
    return { loggedIn: false, error: e.message };
  }
}

/**
 * Application service for NetEase authentication orchestration.
 *
 * It keeps Socket event names in the handler while owning login/session setup,
 * QR polling decisions, recommender initialization, and cold-start reset.
 */
export function createAuthenticationService({
  authClient,
  authRepository = { currentCookie: () => '' },
  recommender,
  queue,
  scheduler,
  planner = { generatePlan: async () => null },
  eventPublisher = { emit: () => {} },
}) {
  async function initializeAuthenticatedSession(loginResult) {
    const profile = authProfileFromResult(loginResult);
    const uid = authUserIdFromResult(loginResult);

    await recommender.init(uid);
    scheduler.coldStartState = 'pending';
    const songs = await recommender.fillQueue(20);
    const queueUpdate = queueUpdateIfNeeded(queue, songs);

    return {
      loginSuccess: { profile },
      ...(queueUpdate ? { queueUpdate } : {}),
    };
  }

  return {
    /**
     * Read the current NetEase login status as a REST-friendly DTO.
     *
     * @returns {Promise<{loggedIn: boolean, profile: object|null, error?: string}>} Auth status payload.
     * @throws Does not throw; legacy client failures are returned as logged-out status.
     * Constraint: preserves `/api/auth/status` shape while centralizing NetEase response normalization.
     */
    async currentStatus() {
      return currentStatusPayload(authClient);
    },

    /**
     * Restore an already-authenticated listener session from a stored cookie.
     *
     * @returns {Promise<object>} Startup summary for logging and optional UI events.
     * @throws Bubbles queue/recommender failures to preserve the legacy auto-start skip path.
     * Constraint: does not start playback; it only prepares the queue for client-ready cold start.
     */
    async restoreStoredSession() {
      const cookie = authRepository.currentCookie();
      if (!cookie) {
        return { cookieFound: false, restored: false };
      }

      const status = authLoginStatusFromResult(await authClient.checkLoginStatus());
      if (!status.uid) {
        return {
          cookieFound: true,
          cookiePreview: cookiePreview(cookie),
          restored: false,
        };
      }

      await recommender.init(status.uid);

      const { plan, planError } = await generateStartupPlan(planner, eventPublisher);
      const blocks = applyStartupPlan(recommender, plan);
      await recommender.fillQueue(INITIAL_RESTORE_QUEUE_SIZE, blocks);

      const queuePrepared = !queue.isEmpty;
      if (queuePrepared) {
        scheduler.prepareQueue();
      }

      return restoredSessionSummary({ cookie, status, plan, planError, queue, queuePrepared });
    },

    /**
     * Login with phone/password and prepare the first authenticated queue.
     *
     * @param {{phone: string, password: string}} input User credentials from socket payload.
     * @returns {Promise<object>} Socket-compatible login and optional queue payloads.
     * @throws Bubbles AuthClient failures so the handler can preserve AUTH_FAILED emission.
     * Constraint: does not start playback; cold start remains client-ready driven.
     */
    async loginWithPhone({ phone, password }) {
      const loginResult = await authClient.phoneLogin(phone, password);
      return initializeAuthenticatedSession(loginResult);
    },

    /**
     * Create a NetEase QR login session.
     *
     * @returns {Promise<{qrCreated: object}>} Socket-compatible auth:qr-created payload.
     * @throws Bubbles AuthClient failures so the handler can preserve QR_FAILED emission.
     * Constraint: polling remains transport-owned because it is tied to socket disconnect cleanup.
     */
    async createQrLogin() {
      const result = await authClient.createQrLogin();
      return { qrCreated: qrCreatedPayload(result) };
    },

    /**
     * Check a QR login key and initialize the session when NetEase reports success.
     *
     * @param {string} key QR login key returned by createQrLogin.
     * @returns {Promise<object>} QR status, expiration, or login payloads.
     * @throws Bubbles AuthClient failures; the polling loop may ignore transient failures.
     * Constraint: returns semantic payloads while keeping concrete socket event names outside.
     */
    async checkQrLogin(key) {
      const check = await authClient.checkQrLogin(key);
      const qrStatus = qrStatusFromCode(check?.code);

      if (qrStatus.status === 'success') {
        return {
          done: true,
          ...(await initializeAuthenticatedSession(await authClient.checkLoginStatus())),
        };
      }

      if (qrStatus.status === 'expired') {
        return { done: true, qrExpired: true };
      }

      return {
        done: qrStatus.terminal,
        qrStatus: { status: qrStatus.status },
      };
    },
  };
}
