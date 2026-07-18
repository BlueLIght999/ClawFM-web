import { shouldBuildClient } from './buildRules.js';

function verdict(status) {
  if (status === 'fail') return 'NOT READY';
  if (status === 'warn') return 'READY WITH WARNINGS';
  return 'READY';
}

export function formatDoctorReport({ report, buildState }) {
  const stale = shouldBuildClient(buildState);
  const effectiveStatus = report.status === 'fail' ? 'fail' : report.status === 'warn' || stale ? 'warn' : 'pass';
  const lines = ['Qclaudio Startup Doctor', `Verdict: ${verdict(effectiveStatus)}`, ''];
  for (const check of report.checks) lines.push(`[${check.status.toUpperCase()}] ${check.id}`);

  if (report.failures.length > 0) {
    lines.push('', 'Failures:');
    for (const failure of report.failures) lines.push(`- ${failure}`);
  }
  if (report.warnings.length > 0) {
    lines.push('', 'Warnings:');
    for (const warning of report.warnings) lines.push(`- ${warning}`);
  }

  lines.push('', `Client build: ${stale ? 'STALE' : 'CURRENT'}`);
  return lines.join('\n');
}
