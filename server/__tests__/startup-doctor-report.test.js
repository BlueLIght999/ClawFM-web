import { describe, expect, it } from 'vitest';
import { formatDoctorReport } from '../../bin/startup/doctorReport.js';

describe('formatDoctorReport', () => {
  it('formatDoctorReport_includesVerdictWarningsAndBuildState', () => {
    const text = formatDoctorReport({
      report: {
        status: 'pass',
        failures: [],
        warnings: [],
        checks: [{ id: 'runtime', status: 'pass' }, { id: 'environment', status: 'pass' }],
      },
      buildState: {
        distExists: true,
        currentFingerprint: 'new',
        previousFingerprint: 'old',
      },
    });

    expect(text).toContain('READY WITH WARNINGS');
    expect(text).toContain('STALE');
  });
});
