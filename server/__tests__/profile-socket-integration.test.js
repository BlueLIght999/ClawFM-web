import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readSrc = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');

describe('Profile socket integration', () => {
  it('events_js_definesProfileEvents', () => {
    const src = readSrc('../socket/events.js');
    expect(src).toContain('PROFILE_UPDATED');
    expect(src).toContain('PROFILE_ANALYSIS');
    expect(src).toContain('PROFILE_CLUSTER');
    expect(src).toContain('PROFILE_TAGS');
  });

  it('handler_js_wiresProfileEvents', () => {
    const src = readSrc('../socket/handler.js');
    // handler.js imports and calls wireProfileEvents
    expect(src).toContain('wireProfileEvents');
    // Implementation details live in profileEvents.js (extracted)
    const profileSrc = readSrc('../socket/profileEvents.js');
    expect(profileSrc).toContain('sanitizeProfileForClient');
    expect(profileSrc).toContain('EVENTS.PROFILE_UPDATED');
    expect(profileSrc).toContain('EVENTS.PROFILE_ANALYSIS');
    expect(profileSrc).toContain('EVENTS.PROFILE_CLUSTER');
  });

  it('handler_js_wireProfileEventsGuarded', () => {
    // Guard lives in profileEvents.js (extracted from handler.js)
    const src = readSrc('../socket/profileEvents.js');
    expect(src).toMatch(/if\s*\(\s*!deps\.profileSystem\s*\)/);
  });

  it('handler_js_callsWireProfileEventsInSetup', () => {
    const src = readSrc('../socket/handler.js');
    // wireProfileEvents should be called in setupSocketHandler
    const setupMatch = src.match(/export function setupSocketHandler[\s\S]*?^}/m);
    expect(setupMatch).not.toBeNull();
    expect(setupMatch[0]).toContain('wireProfileEvents');
  });
});

describe('Profile metrics integration', () => {
  it('metrics_js_definesProfileCounters', () => {
    const src = readSrc('../infrastructure/metrics/metrics.js');
    expect(src).toContain('profileCollections');
    expect(src).toContain('profileEnrichments');
    expect(src).toContain('radio_profile_collections_total');
    expect(src).toContain('radio_profile_enrichments_total');
  });

  it('metrics_js_definesProfileGauges', () => {
    const src = readSrc('../infrastructure/metrics/metrics.js');
    expect(src).toContain('profileTagCount');
    expect(src).toContain('profileSnapshotCount');
    expect(src).toContain('radio_profile_tag_count');
    expect(src).toContain('radio_profile_snapshot_count');
  });

  it('metrics_js_definesProfileHistograms', () => {
    const src = readSrc('../infrastructure/metrics/metrics.js');
    expect(src).toContain('profilePipelineDuration');
    expect(src).toContain('profileAnalysisDuration');
    expect(src).toContain('radio_profile_pipeline_duration_seconds');
    expect(src).toContain('radio_profile_analysis_duration_seconds');
  });
});

describe('Profile dashboard and frontend', () => {
  it('dashboard_profilePanelExists', () => {
    const panelPath = path.resolve(__dirname, '../dashboard/profile-panel.html');
    expect(fs.existsSync(panelPath)).toBe(true);
    const src = fs.readFileSync(panelPath, 'utf-8');
    expect(src).toContain('profile:updated');
    expect(src).toContain('profile:analysis');
    expect(src).toContain('profile:cluster');
  });

  it('frontend_profilePanelExists', () => {
    const panelPath = path.resolve(__dirname, '../../client/src/components/ProfilePanel.jsx');
    expect(fs.existsSync(panelPath)).toBe(true);
    const src = fs.readFileSync(panelPath, 'utf-8');
    expect(src).toContain('profile:updated');
    expect(src).toContain('profile:cluster');
    expect(src).toContain('export default');
  });
});
