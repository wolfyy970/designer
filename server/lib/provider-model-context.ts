/**
 * Cached OpenRouter `/models` lookup so agent + HTTP paths can align budgets with each model's context.
 */
import { OpenRouterGenerationProvider } from '../services/providers/openrouter.ts';

const CACHE_TTL_MS = 60_000;

let openRouterCache: { at: number; contextById: Map<string, number> } | null = null;

async function getOpenRouterContextMap(): Promise<Map<string, number>> {
  const now = Date.now();
  if (openRouterCache && now - openRouterCache.at < CACHE_TTL_MS) {
    return openRouterCache.contextById;
  }
  const provider = new OpenRouterGenerationProvider();
  const models = await provider.listModels();
  const contextById = new Map<string, number>();
  for (const m of models) {
    if (m.contextLength != null && m.contextLength > 0) {
      contextById.set(m.id, m.contextLength);
    }
  }
  openRouterCache = { at: now, contextById };
  return contextById;
}

/** Total context window for a model when the provider publishes it (OpenRouter). */
export async function getProviderModelContextWindow(
  providerId: string,
  modelId: string,
): Promise<number | undefined> {
  if (providerId !== 'openrouter') return undefined;
  const map = await getOpenRouterContextMap();
  return map.get(modelId);
}
