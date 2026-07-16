/**
 * @typedef {Object} ToolRegistryPort
 * @property {(tool: ToolDefinition) => void} register - Register a tool by its name.
 * @property {(name: string) => ToolDefinition|null} get - Look up a tool by name.
 * @property {() => ToolDefinition[]} list - List all registered tools.
 * @property {(name: string) => boolean} has - Check if a tool is registered.
 * @property {() => Array<{name: string, description: string, parameters: object}>} describeAll - Get tool schemas for LLM function calling.
 */

export {};
