/**
 * In-memory implementation of ToolRegistryPort.
 *
 * @returns {import('../application/ports/ToolRegistryPort.js').ToolRegistryPort}
 */
export function createInMemoryToolRegistry() {
  const tools = new Map();

  return {
    register(tool) {
      if (!tool?.name) throw new Error('Tool must have a name');
      tools.set(tool.name, tool);
    },

    get(name) {
      return tools.get(name) || null;
    },

    list() {
      return Array.from(tools.values());
    },

    has(name) {
      return tools.has(name);
    },

    describeAll() {
      return Array.from(tools.values()).map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }));
    },
  };
}

export const inMemoryToolRegistry = createInMemoryToolRegistry();
