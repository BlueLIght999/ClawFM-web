import http from 'http';

const MAX_RESPONSE_BYTES = 64 * 1024;

export function classifyInstanceResponse({ connected, statusCode = null, body = null }) {
  if (!connected) return { status: 'absent' };

  const isQclaudio = statusCode === 200
    && body?.status === 'ready'
    && body?.service === 'qclaudio'
    && typeof body?.instanceId === 'string'
    && body.instanceId.length > 0;

  if (isQclaudio) return { status: 'qclaudio', readiness: body };
  return { status: 'foreign', statusCode };
}

function requestJson(url, { timeoutMs = 1500, httpGet = http.get } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const req = httpGet(url, (res) => {
      let bodyText = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        if (bodyText.length < MAX_RESPONSE_BYTES) bodyText += chunk;
      });
      res.on('end', () => {
        let body = null;
        try {
          body = bodyText ? JSON.parse(bodyText) : null;
        } catch {
          body = null;
        }
        finish({ connected: true, statusCode: res.statusCode, body, rawBody: bodyText });
      });
    });

    req.on('error', (error) => {
      finish({ connected: error.code !== 'ECONNREFUSED', errorCode: error.code });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      finish({ connected: true, errorCode: 'ETIMEDOUT' });
    });
  });
}

export async function probeInstance({ baseUrl, timeoutMs = 1500, request = requestJson }) {
  const readinessUrl = new URL('/health/ready', baseUrl).toString();
  const response = await request(readinessUrl, { timeoutMs });
  const classified = classifyInstanceResponse(response);
  if (classified.status !== 'foreign' || !response.rawBody?.includes('<title>Qclaudio 88.7</title>')) {
    return classified;
  }

  // Older Qclaudio versions route unknown paths to the SPA. Confirm a second,
  // JSON-only signal before treating that process as an owned legacy instance.
  const authUrl = new URL('/api/auth/status', baseUrl).toString();
  const authResponse = await request(authUrl, { timeoutMs });
  if (authResponse.statusCode !== 200 || typeof authResponse.body?.loggedIn !== 'boolean') {
    return classified;
  }

  const parsed = new URL(baseUrl);
  return {
    status: 'qclaudio',
    readiness: {
      status: 'ready',
      service: 'qclaudio',
      instanceId: `legacy-${parsed.hostname}-${parsed.port || '80'}`,
      version: 'legacy',
      buildId: 'legacy',
    },
  };
}
