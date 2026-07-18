import { describe, expect, it, vi } from 'vitest';
import { classifyInstanceResponse, probeInstance } from '../../bin/startup/instanceProbe.js';

describe('classifyInstanceResponse', () => {
  it('classifyInstanceResponse_whenConnectionRefused_returnsAbsent', () => {
    expect(classifyInstanceResponse({ connected: false })).toEqual({ status: 'absent' });
  });

  it('classifyInstanceResponse_whenReadinessIdentityMatches_returnsQclaudio', () => {
    const readiness = {
      status: 'ready',
      service: 'qclaudio',
      instanceId: 'instance-1',
      version: '1.0.0',
      buildId: 'build-1',
    };

    expect(classifyInstanceResponse({ connected: true, statusCode: 200, body: readiness }))
      .toEqual({ status: 'qclaudio', readiness });
  });

  it('classifyInstanceResponse_whenPortRespondsWithoutIdentity_returnsForeign', () => {
    expect(classifyInstanceResponse({ connected: true, statusCode: 200, body: { ok: true } }))
      .toEqual({ status: 'foreign', statusCode: 200 });
  });

  it('probeInstance_whenLegacyQclaudioRuns_reusesItUsingTwoIdentitySignals', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({
        connected: true,
        statusCode: 200,
        body: null,
        rawBody: '<title>Qclaudio 88.7</title>',
      })
      .mockResolvedValueOnce({
        connected: true,
        statusCode: 200,
        body: { loggedIn: true },
        rawBody: '{"loggedIn":true}',
      });

    const result = await probeInstance({ baseUrl: 'http://localhost:3333', request });

    expect(result.status).toBe('qclaudio');
    expect(result.readiness).toEqual(expect.objectContaining({
      status: 'ready',
      service: 'qclaudio',
      version: 'legacy',
    }));
    expect(request).toHaveBeenCalledTimes(2);
  });
});
