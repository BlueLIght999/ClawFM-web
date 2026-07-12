import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * D8 守卫：只有 bootstrap.js 可以同时导入 infrastructure + application。
 * handler.js 和 server.js 必须从 bootstrap 接收已装配的 services，
 * 不得自行导入 infrastructure 适配器或 application service 工厂。
 */
describe('bootstrap composition root (D8)', () => {
  const bootstrapPath = path.resolve(__dirname, '../bootstrap.js');
  const handlerPath = path.resolve(__dirname, '../socket/handler.js');
  const serverPath = path.resolve(__dirname, '../server.js');

  // ---- bootstrap.js 存在且包含组合逻辑 ----

  it('bootstrapFileExists', () => {
    expect(fs.existsSync(bootstrapPath)).toBe(true);
  });

  it('bootstrapImportsInfrastructureAdapters', () => {
    if (!fs.existsSync(bootstrapPath)) return;
    const src = fs.readFileSync(bootstrapPath, 'utf-8');
    expect(src).toContain("from './infrastructure/");
  });

  it('bootstrapImportsApplicationServiceFactories', () => {
    if (!fs.existsSync(bootstrapPath)) return;
    const src = fs.readFileSync(bootstrapPath, 'utf-8');
    expect(src).toContain('createPlaybackService');
    expect(src).toContain('createConversationService');
    expect(src).toContain('createColdStartService');
    expect(src).toContain('createStreamingConversationService');
    expect(src).toContain('createAuthenticationService');
    expect(src).toContain('createDjSpeechService');
    expect(src).toContain('createAgentTurnService');
    expect(src).toContain('createPlanBlockService');
    expect(src).toContain('createCrabInteractionService');
  });

  it('bootstrapExportsCreateServices', () => {
    if (!fs.existsSync(bootstrapPath)) return;
    const src = fs.readFileSync(bootstrapPath, 'utf-8');
    expect(src).toMatch(/export\s+function\s+createServices/);
  });

  // ---- handler.js 不得直接导入 infrastructure 或 application service 工厂 ----

  it('handlerDoesNotImportInfrastructure', () => {
    const src = fs.readFileSync(handlerPath, 'utf-8');
    expect(src).not.toContain("from '../infrastructure/");
  });

  it('handlerDoesNotImportApplicationServiceFactories', () => {
    const src = fs.readFileSync(handlerPath, 'utf-8');
    expect(src).not.toContain('createPlaybackService');
    expect(src).not.toContain('createConversationService');
    expect(src).not.toContain('createColdStartService');
    expect(src).not.toContain('createStreamingConversationService');
    expect(src).not.toContain('createAuthenticationService');
    expect(src).not.toContain('createDjSpeechService');
    expect(src).not.toContain('createAgentTurnService');
    expect(src).not.toContain('createPlanBlockService');
    expect(src).not.toContain('createCrabInteractionService');
  });

  it('handlerDoesNotImportLegacyServicesDirectly', () => {
    const src = fs.readFileSync(handlerPath, 'utf-8');
    // D7 精神：handler 不应直连旧 services/，应从 bootstrap 接收
    expect(src).not.toContain("from '../services/queue.js'");
    expect(src).not.toContain("from '../services/scheduler.js'");
    expect(src).not.toContain("from '../services/recommender.js'");
    expect(src).not.toContain("from '../services/context.js'");
    expect(src).not.toContain("from '../services/tts.js'");
    expect(src).not.toContain("from '../services/weather.js'");
    expect(src).not.toContain("from '../services/planner.js'");
    expect(src).not.toContain("from '../services/proactive.js'");
  });

  it('handlerSetupSocketHandlerAcceptsServicesParameter', () => {
    const src = fs.readFileSync(handlerPath, 'utf-8');
    // setupSocketHandler should accept (io, services) — the services param is new
    expect(src).toMatch(/setupSocketHandler\(\s*io\s*,\s*services\s*\)/);
  });

  // ---- server.js 也不得自行导入 application service 工厂 ----

  it('serverDoesNotImportApplicationServiceFactories', () => {
    const src = fs.readFileSync(serverPath, 'utf-8');
    expect(src).not.toContain('createAuthenticationService');
  });

  it('serverImportsBootstrap', () => {
    const src = fs.readFileSync(serverPath, 'utf-8');
    expect(src).toContain("from './bootstrap.js'");
  });
});
