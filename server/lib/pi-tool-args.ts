import { z } from 'zod';

/** Tool call `arguments` objects from Pi are JSON-like records; extract common fields safely. */
const toolArgsRecordSchema = z.record(z.string(), z.unknown());

const TOOL_PATH_ARG_KEYS = ['path', 'file', 'filePath', 'target_file'] as const;

/**
 * Resolve a filesystem path from Pi tool `arguments` (partial or finalized tool calls).
 * Validated via Zod record parse; unknown shapes return `undefined`.
 */
export function extractPiToolPathFromArguments(raw: unknown): string | undefined {
  const parsed = toolArgsRecordSchema.safeParse(raw);
  if (!parsed.success) return undefined;
  const o = parsed.data;
  for (const key of TOOL_PATH_ARG_KEYS) {
    const v = o[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

/**
 * Parse execution args for progress/trace labels. Returns empty fields when shape is not an object record.
 */
export function parsePiToolExecutionArgs(
  _toolName: string,
  raw: unknown,
): { path?: string; pattern?: string } {
  void _toolName; // reserved for per-tool stricter validation
  const parsed = toolArgsRecordSchema.safeParse(raw);
  if (!parsed.success) {
    return {};
  }
  const o = parsed.data;
  const path = typeof o.path === 'string' ? o.path : undefined;
  const pattern = typeof o.pattern === 'string' ? o.pattern : undefined;
  const key = typeof o.key === 'string' ? o.key : undefined;
  const name = typeof o.name === 'string' ? o.name : undefined;
  return { path: path ?? key ?? name, pattern };
}
