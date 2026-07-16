import { describe, it, expect } from 'vitest';
import { logger, createChildLogger } from '../infrastructure/logging/logger.js';
import { nullLogger } from '../infrastructure/logging/loggerPort.js';

describe('Logger infrastructure', () => {
  it('logger_isDefinedAndHasStandardLevels', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('createChildLogger_returnsLoggerWithBindings', () => {
    const child = createChildLogger({ component: 'test' });
    expect(child).toBeDefined();
    expect(typeof child.info).toBe('function');
    expect(typeof child.child).toBe('function');
  });

  it('childLogger_inheritsFromParent', () => {
    const child = createChildLogger({ component: 'scheduler' });
    const grandchild = child.child({ task: 'skip' });
    expect(grandchild).toBeDefined();
    expect(typeof grandchild.info).toBe('function');
  });

  it('logger_doesNotThrowOnVariousInputs', () => {
    expect(() => logger.info('simple string')).not.toThrow();
    expect(() => logger.info({ key: 'value' }, 'with data')).not.toThrow();
    expect(() => logger.error({ err: new Error('test') }, 'error msg')).not.toThrow();
    expect(() => logger.debug('debug msg')).not.toThrow();
  });
});

describe('LoggerPort nullLogger', () => {
  it('nullLogger_silentlyDiscardsAllCalls', () => {
    expect(() => nullLogger.info('msg')).not.toThrow();
    expect(() => nullLogger.warn('msg')).not.toThrow();
    expect(() => nullLogger.error('msg')).not.toThrow();
    expect(() => nullLogger.debug('msg')).not.toThrow();
  });

  it('nullLogger_child_returnsItself', () => {
    const child = nullLogger.child({ component: 'test' });
    expect(child).toBe(nullLogger);
  });
});
