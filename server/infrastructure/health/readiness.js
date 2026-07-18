export function createReadiness({ env = process.env, pid = process.pid } = {}) {
  return Object.freeze({
    status: 'ready',
    service: 'qclaudio',
    instanceId: env.QCLAUDIO_INSTANCE_ID || `qclaudio-${pid}`,
    version: env.npm_package_version || '2.0.0',
    buildId: env.QCLAUDIO_BUILD_ID || 'development',
  });
}
