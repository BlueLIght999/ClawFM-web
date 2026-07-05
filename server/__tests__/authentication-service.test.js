import { describe, it, expect, vi } from 'vitest';
import { createAuthenticationService } from '../application/services/AuthenticationService.js';

function createDeps(overrides = {}) {
  const authClient = {
    phoneLogin: vi.fn(async () => ({ profile: { userId: 42, nickname: 'Listener' } })),
    createQrLogin: vi.fn(async () => ({ unikey: 'qr-key', qrimg: 'qr-img' })),
    checkQrLogin: vi.fn(async () => ({ code: 801 })),
    checkLoginStatus: vi.fn(async () => ({ profile: { userId: 42, nickname: 'Listener' } })),
    ...overrides.authClient,
  };
  const authRepository = {
    currentCookie: vi.fn(() => 'MUSIC_U=stored'),
    saveSession: vi.fn(),
    ...overrides.authRepository,
  };
  const recommender = {
    init: vi.fn(async () => {}),
    fillQueue: vi.fn(async () => [{ id: 'song' }]),
    setPlanBlocks: vi.fn(),
    ...overrides.recommender,
  };
  const queue = {
    upcomingSongs: [{ id: 'queued' }],
    length: 1,
    isEmpty: false,
    ...overrides.queue,
  };
  const scheduler = {
    coldStartState: 'done',
    prepareQueue: vi.fn(),
    ...overrides.scheduler,
  };
  const planner = {
    generatePlan: vi.fn(async () => ({ id: 'plan-1', blocks: [{ genreHints: ['jazz'] }] })),
    ...overrides.planner,
  };
  const eventPublisher = {
    emit: vi.fn(),
    ...overrides.eventPublisher,
  };
  return {
    authClient,
    authRepository,
    recommender,
    queue,
    scheduler,
    planner,
    eventPublisher,
  };
}

describe('AuthenticationService', () => {
  it('loginWithPhone_success_initializesSessionAndReturnsSocketPayloads', async () => {
    const deps = createDeps();
    const service = createAuthenticationService(deps);

    const result = await service.loginWithPhone({ phone: '13800000000', password: 'secret' });

    expect(deps.authClient.phoneLogin).toHaveBeenCalledWith('13800000000', 'secret');
    expect(deps.recommender.init).toHaveBeenCalledWith('42');
    expect(deps.recommender.fillQueue).toHaveBeenCalledWith(20);
    expect(deps.scheduler.coldStartState).toBe('pending');
    expect(result).toEqual({
      loginSuccess: { profile: { userId: 42, nickname: 'Listener' } },
      queueUpdate: { upcomingSongs: [{ id: 'queued' }] },
    });
  });

  it('createQrLogin_returnsQrCreatedPayload', async () => {
    const deps = createDeps();
    const service = createAuthenticationService(deps);

    const result = await service.createQrLogin();

    expect(deps.authClient.createQrLogin).toHaveBeenCalledOnce();
    expect(result).toEqual({
      qrCreated: {
        key: 'qr-key',
        qrUrl: 'https://music.163.com/login?codekey=qr-key',
        qrimg: 'qr-img',
      },
    });
  });

  it('checkQrLogin_waitingScan_returnsQrStatusPayload', async () => {
    const deps = createDeps();
    const service = createAuthenticationService(deps);

    const result = await service.checkQrLogin('qr-key');

    expect(deps.authClient.checkQrLogin).toHaveBeenCalledWith('qr-key');
    expect(result).toEqual({
      done: false,
      qrStatus: { status: 'waiting-scan' },
    });
  });

  it('checkQrLogin_success_initializesSessionFromLoginStatus', async () => {
    const deps = createDeps({
      authClient: {
        checkQrLogin: vi.fn(async () => ({ code: 803 })),
      },
    });
    const service = createAuthenticationService(deps);

    const result = await service.checkQrLogin('qr-key');

    expect(deps.authClient.checkLoginStatus).toHaveBeenCalledOnce();
    expect(deps.recommender.init).toHaveBeenCalledWith('42');
    expect(result).toEqual({
      done: true,
      loginSuccess: { profile: { userId: 42, nickname: 'Listener' } },
      queueUpdate: { upcomingSongs: [{ id: 'queued' }] },
    });
  });

  it('currentStatus_nestedAnonymousAccount_reportsLoggedOutWithoutThrowing', async () => {
    const deps = createDeps({
      authClient: {
        checkLoginStatus: vi.fn(async () => ({
          data: { account: { id: 99, anonimousUser: true } },
        })),
      },
    });
    const service = createAuthenticationService(deps);

    const result = await service.currentStatus();

    expect(result).toEqual({
      loggedIn: false,
      profile: { id: 99, anonimousUser: true },
    });
  });

  it('restoreStoredSession_cookiePresent_initializesPlanQueueAndPrepareQueue', async () => {
    const deps = createDeps();
    const service = createAuthenticationService(deps);

    const result = await service.restoreStoredSession();

    expect(deps.authRepository.currentCookie).toHaveBeenCalledOnce();
    expect(deps.authClient.checkLoginStatus).toHaveBeenCalledOnce();
    expect(deps.recommender.init).toHaveBeenCalledWith('42');
    expect(deps.planner.generatePlan).toHaveBeenCalledOnce();
    expect(deps.eventPublisher.emit).toHaveBeenCalledWith('plan:update', {
      id: 'plan-1',
      blocks: [{ genreHints: ['jazz'] }],
    });
    expect(deps.recommender.setPlanBlocks).toHaveBeenCalledWith([{ genreHints: ['jazz'] }], 'plan-1');
    expect(deps.recommender.fillQueue).toHaveBeenCalledWith(15, [{ genreHints: ['jazz'] }]);
    expect(deps.scheduler.prepareQueue).toHaveBeenCalledOnce();
    expect(result).toEqual({
      cookieFound: true,
      cookiePreview: 'MUSIC_U=stored',
      restored: true,
      uid: '42',
      planGenerated: true,
      queueLength: 1,
      queuePrepared: true,
      currentSongTitle: null,
    });
  });

  it('restoreStoredSession_noCookie_skipsNetworkAndQueueWork', async () => {
    const deps = createDeps({
      authRepository: {
        currentCookie: vi.fn(() => ''),
      },
    });
    const service = createAuthenticationService(deps);

    const result = await service.restoreStoredSession();

    expect(deps.authClient.checkLoginStatus).not.toHaveBeenCalled();
    expect(deps.recommender.init).not.toHaveBeenCalled();
    expect(deps.planner.generatePlan).not.toHaveBeenCalled();
    expect(result).toEqual({
      cookieFound: false,
      restored: false,
    });
  });

  it('restoreStoredSession_planFailureStillFillsQueueWithoutHints', async () => {
    const deps = createDeps({
      planner: {
        generatePlan: vi.fn(async () => {
          throw new Error('planner down');
        }),
      },
    });
    const service = createAuthenticationService(deps);

    const result = await service.restoreStoredSession();

    expect(deps.recommender.init).toHaveBeenCalledWith('42');
    expect(deps.recommender.fillQueue).toHaveBeenCalledWith(15, null);
    expect(deps.scheduler.prepareQueue).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      restored: true,
      planGenerated: false,
      planError: 'planner down',
    });
  });
});
