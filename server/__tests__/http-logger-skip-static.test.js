import { describe, it, expect } from 'vitest';
import { httpLogger } from '../infrastructure/logging/httpLogger.js';

/**
 * Bug 2 (HIGH): httpLogger 对静态文件生效
 * httpLogger 中间件应跳过静态文件请求（.js, .css, 图片等），
 * 只记录 API 请求和页面请求。
 */
describe('httpLogger skips static files', () => {

  function createMockReq(pathname) {
    return { method: 'GET', url: pathname, path: pathname, headers: {}, query: {} };
  }

  function createMockRes() {
    const res = { statusCode: 200, on: (_event, _cb) => {} };
    return res;
  }

  it('skips_logging_for_js_files', () => {
    const middleware = httpLogger();
    const req = createMockReq('/assets/index.a1b2c3.js');
    const res = createMockRes();
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    // req.log should NOT be set for static files
    expect(req.log).toBeUndefined();
  });

  it('skips_logging_for_css_files', () => {
    const middleware = httpLogger();
    const req = createMockReq('/assets/style.d4e5f6.css');
    const res = createMockRes();
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect(req.log).toBeUndefined();
  });

  it('skips_logging_for_image_files', () => {
    const middleware = httpLogger();
    const req = createMockReq('/logo.png');
    const res = createMockRes();
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect(req.log).toBeUndefined();
  });

  it('skips_logging_for_font_files', () => {
    const middleware = httpLogger();
    const req = createMockReq('/fonts/inter.woff2');
    const res = createMockRes();
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect(req.log).toBeUndefined();
  });

  it('logs_api_requests', () => {
    const middleware = httpLogger();
    const req = createMockReq('/api/auth/status');
    const res = createMockRes();
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect(req.log).toBeDefined();
    expect(req.id).toBeDefined();
  });

  it('logs_health_endpoint', () => {
    const middleware = httpLogger();
    const req = createMockReq('/health');
    const res = createMockRes();
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect(req.log).toBeDefined();
  });

  it('logs_dashboard_page', () => {
    const middleware = httpLogger();
    const req = createMockReq('/dashboard');
    const res = createMockRes();
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect(req.log).toBeDefined();
  });

  it('skips_logging_for_favicon', () => {
    const middleware = httpLogger();
    const req = createMockReq('/favicon.ico');
    const res = createMockRes();
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect(req.log).toBeUndefined();
  });
});
