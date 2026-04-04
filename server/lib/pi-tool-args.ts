import { z } from 'zod';

/** Tool call `arguments` objects from Pi are JSON-like records; extract common fields safely. */
const toolArgsRecordSchema = z.record(z.string(), z.unknown());

export interface PiToolProgressFields {
  path?: string;
  pattern?: string;
}

/**
 * Parse execution args for progress/trace labels. Returns empty fields when shape is not an object record.
 */
export function parsePiToolExecutionArgs(_toolName: string, raw: unknown): PiToolProgressFields {
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
