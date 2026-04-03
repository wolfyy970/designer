/**
 * Heuristic classification of Langfuse client errors (SDK does not always export stable types).
 * Used to avoid noisy dev logs for expected missing prompts.
 */

function isLangfuseNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const o = err as Record<string, unknown>;
  if (o.status === 404 || o.statusCode === 404) return true;
  if (typeof o.name === 'string' && /notfounderror/i.test(o.name)) return true;
  const msg = typeof o.message === 'string' ? o.message : String(err);
  return /\b404\b/.test(msg) || /not\s*found/i.test(msg);
}

export function logUnexpectedLangfusePromptDev(op: string, detail: string, err: unknown): void {
  if (process.env.NODE_ENV === 'production') return;
  if (isLangfuseNotFoundError(err)) return;
  console.warn(`[langfuse] ${op} — ${detail}:`, err);
}
