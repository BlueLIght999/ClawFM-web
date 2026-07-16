import { describe, it, expect } from 'vitest';
import { createInMemoryToolRegistry } from '../agent/infrastructure/InMemoryToolRegistry.js';
import { createToolDefinition } from '../agent/domain/toolDefinition.js';

describe('InMemoryToolRegistry', () => {
  it('registerAndGet_toolByName', () => {
    const registry = createInMemoryToolRegistry();
    const tool = createToolDefinition({ name: 'skip', execute: async () => {} });
    registry.register(tool);
    expect(registry.get('skip')).toBe(tool);
  });

  it('get_unknownTool_returnsNull', () => {
    const registry = createInMemoryToolRegistry();
    expect(registry.get('nonexistent')).toBeNull();
  });

  it('has_returnsTrueForRegistered', () => {
    const registry = createInMemoryToolRegistry();
    registry.register(createToolDefinition({ name: 'skip', execute: async () => {} }));
    expect(registry.has('skip')).toBe(true);
    expect(registry.has('pause')).toBe(false);
  });

  it('list_returnsAllRegisteredTools', () => {
    const registry = createInMemoryToolRegistry();
    registry.register(createToolDefinition({ name: 'skip', execute: async () => {} }));
    registry.register(createToolDefinition({ name: 'pause', execute: async () => {} }));
    expect(registry.list()).toHaveLength(2);
  });

  it('describeAll_returnsSchemasWithoutExecutors', () => {
    const registry = createInMemoryToolRegistry();
    registry.register(createToolDefinition({
      name: 'skip',
      description: 'Skip song',
      parameters: { type: 'object', properties: {} },
      execute: async () => {},
    }));
    const descriptions = registry.describeAll();
    expect(descriptions).toHaveLength(1);
    expect(descriptions[0].name).toBe('skip');
    expect(descriptions[0].description).toBe('Skip song');
    expect(descriptions[0].execute).toBeUndefined();
  });

  it('register_duplicateName_overwritesPrevious', () => {
    const registry = createInMemoryToolRegistry();
    const tool1 = createToolDefinition({ name: 'skip', description: 'v1', execute: async () => {} });
    const tool2 = createToolDefinition({ name: 'skip', description: 'v2', execute: async () => {} });
    registry.register(tool1);
    registry.register(tool2);
    expect(registry.get('skip').description).toBe('v2');
  });
});
