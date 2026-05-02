/**
 * Build a Pi `Model` object for the active provider. The host supplies provider
 * config (base URL, optional API key) so the package never reads env directly.
 */
import type { Model } from './internal/pi-types.ts';
import {
  DEFAULT_COMPLETION_BUDGET,
  type CompletionBudgetConfig,
  maxCompletionBudgetForContextWindow,
} from './internal/completion-budget.ts';

export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

const ZEROED_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

export interface OpenRouterProviderConfig {
  id: 'openrouter';
  /** e.g. `https://openrouter.ai/api/v1` (with `/api/v1` suffix). */
  baseUrl: string;
  apiKey: string;
}

export interface LMStudioProviderConfig {
  id: 'lmstudio';
  /** e.g. `http://localhost:1234`. The package appends `/v1`. */
  baseUrl: string;
}

export type ProviderConfig = OpenRouterProviderConfig | LMStudioProviderConfig;

export interface BuildModelOptions {
  provider: ProviderConfig;
  modelId: string;
  /** Defaults to 131_072 for OpenRouter, host-supplied for LM Studio. */
  contextWindow?: number;
  thinkingLevel?: ThinkingLevel;
  /** Optional product cap on completion tokens (passes through to the budget calc). */
  maxOutputTokens?: number;
  budgetConfig?: CompletionBudgetConfig;
}

const DEFAULT_OPENROUTER_CONTEXT_WINDOW = 131_072;
const DEFAULT_LMSTUDIO_CONTEXT_WINDOW = 32_768;

export function buildModel(opts: BuildModelOptions): Model<'openai-completions'> {
  const reasoning = !!opts.thinkingLevel && opts.thinkingLevel !== 'off';
  const cwDefault =
    opts.provider.id === 'lmstudio' ? DEFAULT_LMSTUDIO_CONTEXT_WINDOW : DEFAULT_OPENROUTER_CONTEXT_WINDOW;
  const contextWindow = Math.max(4096, opts.contextWindow ?? cwDefault);
  const maxTokens = maxCompletionBudgetForContextWindow(
    contextWindow,
    opts.maxOutputTokens,
    opts.budgetConfig ?? DEFAULT_COMPLETION_BUDGET,
  );

  if (opts.provider.id === 'lmstudio') {
    return {
      id: opts.modelId,
      name: opts.modelId,
      api: 'openai-completions',
      provider: 'lmstudio',
      baseUrl: `${opts.provider.baseUrl}/v1`,
      reasoning,
      input: ['text'],
      cost: ZEROED_COST,
      contextWindow,
      maxTokens,
    };
  }

  return {
    id: opts.modelId,
    name: opts.modelId,
    api: 'openai-completions',
    provider: 'openrouter',
    baseUrl: opts.provider.baseUrl,
    reasoning,
    input: ['text'],
    cost: ZEROED_COST,
    contextWindow,
    maxTokens,
  };
}
