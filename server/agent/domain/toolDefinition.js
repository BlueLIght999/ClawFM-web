/**
 * Create a tool definition for the agent tool registry.
 *
 * @param {object} params
 * @param {string} params.name - Unique tool name (e.g., 'skip', 'recommend')
 * @param {string} [params.description] - Human-readable description for LLM
 * @param {object} [params.parameters] - JSON Schema for tool parameters
 * @param {Function} params.execute - Async executor: (args, context) => Promise<ToolResult>
 * @returns {ToolDefinition}
 * @throws {Error} if name is empty or execute is not a function
 */
export function createToolDefinition({ name, description, parameters, execute }) {
  if (!name || typeof name !== 'string') {
    throw new Error('ToolDefinition: name must be a non-empty string');
  }
  if (typeof execute !== 'function') {
    throw new Error('ToolDefinition: execute must be a function');
  }
  return {
    name,
    description: description || '',
    parameters: parameters || { type: 'object', properties: {} },
    execute,
  };
}
