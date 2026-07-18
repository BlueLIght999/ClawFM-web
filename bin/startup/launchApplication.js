function portFromUrl(url) {
  const parsed = new URL(url);
  return parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
}

export async function launchApplication({ url, noOpen = false, deps }) {
  const existing = await deps.probeInstance({ baseUrl: url });

  if (existing.status === 'foreign') {
    throw new Error(`Port ${portFromUrl(url)} is occupied by another service`);
  }

  if (existing.status === 'qclaudio') {
    if (!noOpen) await deps.openBrowser({ url });
    return { mode: 'reused', readiness: existing.readiness, processHandle: null };
  }

  if (deps.initialize) await deps.initialize();
  const processHandle = deps.startServer();
  try {
    const readiness = await deps.waitUntilReady(processHandle);
    if (!noOpen) await deps.openBrowser({ url });
    return { mode: 'started', readiness, processHandle };
  } catch (error) {
    await deps.stopServer(processHandle);
    throw error;
  }
}
