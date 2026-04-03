/**
 * PI `Model` construction for OpenRouter + LM Studio (used by `createAgentSession`).
 */
import type { Model } from './pi-sdk/types.ts';
import { env } from '../env.ts';
import { completionBudgetFromPromptTokens } from '../lib/completion-budget.ts';

export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

const ZEROED_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

const SESSION_CEILING_FALLBACK_MARGIN = 8192;

/**
 * Session ceiling for Pi `Model.maxTokens` before per-turn prompt estimation (see `piStreamCompletionMaxTokens`).
 */
export function maxCompletionBudgetForContextWindow(totalContext: number): number {
  const capped = completionBudgetFromPromptTokens(
    totalContext,
    0,
    'default',
    env.MAX_OUTPUT_TOKENS,
  );
  if (capped != null) return capped;
  return Math.max(
    4096,
    Math.max(4096, totalContext) - SESSION_CEILING_FALLBACK_MARGIN,
  );
}

/**
 * Construct a PI Model object for the given provider/model pair.
 */
export function buildModel(
  providerId: string,
  modelId: string,
  thinkingLevel?: ThinkingLevel,
  contextWindowFromRegistry?: number,
): Model<'openai-completions'> {
  const reasoning = !!thinkingLevel && thinkingLevel !== 'off';

  const defaultCw = providerId === 'lmstudio' ? env.LM_STUDIO_CONTEXT_WINDOW : 131_072;
  const contextWindow = Math.max(4096, contextWindowFromRegistry ?? defaultCw);
  const maxTokens = maxCompletionBudgetForContextWindow(contextWindow);

  if (providerId === 'lmstudio') {
    return {
      id: modelId,
      name: modelId,
      api: 'openai-completions',
      provider: 'lmstudio',
      baseUrl: `${env.LMSTUDIO_URL}/v1`,
      reasoning,
      input: ['text'],
      cost: ZEROED_COST,
      contextWindow,
      maxTokens,
    };
  }

  return {
    id: modelId,
    name: modelId,
    api: 'openai-completions',
    provider: 'openrouter',
    baseUrl: `${env.OPENROUTER_BASE_URL}/api/v1`,
    reasoning,
    input: ['text'],
    cost: ZEROED_COST,
    contextWindow,
    maxTokens,
  };
}
