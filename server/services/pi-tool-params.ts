/**
 * Pi `ToolDefinition.execute` receives `params` as `unknown` even after TypeBox validation.
 * Centralize the assertion so call sites stay explicit about the expected shape.
 */
export function piToolParams<T extends Record<string, unknown>>(params: unknown): T {
  return params as T;
}
