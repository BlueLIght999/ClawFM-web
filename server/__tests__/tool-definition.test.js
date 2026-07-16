import { describe, it, expect } from 'vitest';
import { createToolDefinition } from '../agent/domain/toolDefinition.js';

describe('ToolDefinition', () => {
  it('createToolDefinition_withValidParams_returnsToolObject', () => {
    const tool = createToolDefinition({
      name: 'skip',
      description: 'Skip current song',
      parameters: { type: 'object', properties: {} },
      execute: async () => ({ handled: true }),
    });
    expect(tool.name).toBe('skip');
    expect(tool.description).toBe('Skip current song');
    expect(typeof tool.execute).toBe('function');
  });

  it('createToolDefinition_emptyName_throwsError', () => {
    expect(() => createToolDefinition({ name: '', execute: () => {} }))
      .toThrow('name must be a non-empty string');
  });

  it('createToolDefinition_executeNotFunction_throwsError', () => {
    expect(() => createToolDefinition({ name: 'test', execute: null }))
      .toThrow('execute must be a function');
  });

  it('createToolDefinition_missingDescription_defaultsToEmpty', () => {
    const tool = createToolDefinition({ name: 'test', execute: () => {} });
    expect(tool.description).toBe('');
  });

  it('createToolDefinition_missingParameters_defaultsToEmptyObject', () => {
    const tool = createToolDefinition({ name: 'test', execute: () => {} });
    expect(tool.parameters).toEqual({ type: 'object', properties: {} });
  });
});
