import { normalizeError } from '../../src/lib/error-utils.ts';
import { normalizeOpenRouterCreditError } from '../../src/lib/openrouter-budget.ts';

export function normalizeProviderError(err: unknown, fallback?: string): string {
  return normalizeOpenRouterCreditError(err) ?? normalizeError(err, fallback);
}
