import { describe, it, expect } from 'vitest';
import { loadConfig, loadConfigByName } from '../infrastructure/profile/ProfileConfigLoader.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configDir = path.resolve(__dirname, '../domain/profile/config');

describe('ProfileConfigLoader', () => {
  it('loadConfig_returnsAllFourConfigs', () => {
    const config = loadConfig(configDir);
    expect(config.tagTaxonomy).toBeDefined();
    expect(config.tagTaxonomy.version).toBe(1);
    expect(config.collectors).toBeDefined();
    expect(config.enrichmentChain).toBeDefined();
    expect(config.schedule).toBeDefined();
  });

  it('loadConfig_tagTaxonomyHasFiveDimensions', () => {
    const config = loadConfig(configDir);
    const dims = Object.keys(config.tagTaxonomy.dimensions);
    expect(dims).toContain('genre');
    expect(dims).toContain('mood');
    expect(dims).toContain('region');
    expect(dims).toContain('behavior');
    expect(dims).toContain('chat');
    expect(dims.length).toBe(5);
  });

  it('loadConfig_scheduleHas6HourInterval', () => {
    const config = loadConfig(configDir);
    expect(config.schedule.analysisIntervalHours).toBe(6);
    expect(config.schedule.firstRunMode).toBe('full');
  });

  it('loadConfig_enrichmentChainHasThreeProviders', () => {
    const config = loadConfig(configDir);
    expect(config.enrichmentChain.songChain.length).toBe(3);
    expect(config.enrichmentChain.songChain[0].provider).toBe('NeteaseTagSearcher');
    expect(config.enrichmentChain.fallback).toBe('mark_unknown');
  });

  it('loadConfigByName_returnsSpecificConfig', () => {
    const schedule = loadConfigByName('schedule', configDir);
    expect(schedule.analysisIntervalHours).toBe(6);
  });

  it('loadConfigByName_unknownName_throws', () => {
    expect(() => loadConfigByName('unknown', configDir)).toThrow('Unknown config: unknown');
  });

  it('loadConfig_collectorsHasAllSixCollectors', () => {
    const config = loadConfig(configDir);
    const names = Object.keys(config.collectors.collectors);
    expect(names).toContain('ListenHistoryCollector');
    expect(names).toContain('ChatHistoryCollector');
    expect(names).toContain('SkipBehaviorCollector');
    expect(names).toContain('TimePatternCollector');
    expect(names).toContain('SearchQueryCollector');
    expect(names).toContain('PlanSelectionCollector');
    expect(names.length).toBe(6);
  });
});
