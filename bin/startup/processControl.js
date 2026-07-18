export function requestShutdown(processHandle, { timeoutMs = 6000 } = {}) {
  if (!processHandle || processHandle.exitCode !== null) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(forceTimer);
      resolve();
    };

    processHandle.once('exit', finish);
    const forceTimer = setTimeout(() => {
      if (processHandle.exitCode === null) processHandle.kill('SIGKILL');
      finish();
    }, timeoutMs);

    if (processHandle.connected && typeof processHandle.send === 'function') {
      processHandle.send({ type: 'shutdown' });
    } else {
      processHandle.kill('SIGTERM');
    }
  });
}
