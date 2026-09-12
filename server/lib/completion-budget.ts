/**
 * Prompt-aware completion budgets: `context_window − prompt − margin`, capped by product limits.
 *
 * **Prompt size** here mostly comes from `estimateChatMessagesTokens` (heuristic). OpenRouter
 * reports exact `usage.prompt_tokens` only **after** `chat/completions` returns; there is no
 * documented universal “preflight count” for all routed models. To tighten budgets in the future,
 * thread the last response's `metadata.promptTokens` into this layer (or max with the heuristic)
 * for sequential calls where the prompt grows monotonically (typical agent loops).
 *
 * Pi agent per-turn streaming uses `server/services/pi-sdk/stream-budget.ts` (imports this module).
 * Numeric knobs live in config/completion-budget.json.
 */
import { z } from 'zod';
import rawBudget from '../../config/completion-budget.json';
import { env } from '../env.ts';
import {
  estimateChatMessagesTokens,
} from '../../src/lib/token-estimate.ts';
import type { ChatMessage } from '../../src/types/provider.ts';

export type CompletionPurpose = 'incubate' | 'compaction' | 'agent_turn' | 'default';

export const CompletionBudgetFileSchema = z
  .object({
    minCompletion:   z.number().int().min(1),
    absoluteCeiling: z.number().int().min(1),
    margins: z
      .object({
        incubate:   z.number().int().min(0),
        compaction: z.number().int().min(0),
        agentTurn:  z.number().int().min(0),
        default:    z.number().int().min(0),
      })
      .strict(),
  })
  .strict();

const _budget = CompletionBudgetFileSchema.parse(rawBudget);

const MIN_COMPLETION = _budget.minCompletion;
const ABSOLUTE_CEILING = _budget.absoluteCeiling;

/** Reserved tokens: formatting, tool defs growth, reasoning, safety. */
const MARGIN: Record<CompletionPurpose, number> = {
  incubate:   _budget.margins.incubate,
  compaction: _budget.margins.compaction,
  agent_turn: _budget.margins.agentTurn,
  default:    _budget.margins.default,
};

/** Default OpenRouter context window when the provider model registry has no entry. */
export const FALLBACK_OPENROUTER_CONTEXT_WINDOW = 131_072;

function contextFallback(providerId: string): number {
  return providerId === 'lmstudio' ? env.LM_STUDIO_CONTEXT_WINDOW : FALLBACK_OPENROUTER_CONTEXT_WINDOW;
}

/**
 * Pure: completion tokens that fit after prompt + margin, optional product cap.
 * Returns `undefined` if the window appears already exhausted (caller may omit max_tokens).
 */
export function completionBudgetFromPromptTokens(
  contextWindow: number,
  estimatedPromptTokens: number,
  purpose: CompletionPurpose,
  productCap?: number,
): number | undefined {
  const cw = Math.max(4096, contextWindow);
  const margin = MARGIN[purpose];
  const prompt = Math.max(0, estimatedPromptTokens);
  const raw = cw - prompt - margin;
  if (raw < MIN_COMPLETION) return undefined;
  let b = Math.min(raw, ABSOLUTE_CEILING);
  if (productCap != null) b = Math.min(b, productCap);
  return Math.max(MIN_COMPLETION, b);
}

/**
 * Resolve the context window for a model, then compute its completion budget.
 *
 * This lived here and imported `../services/provider-model-context.ts` — the one
 * genuine **runtime** inversion of the documented rule that `server/lib` must not
 * import upward into `server/services` (`ARCHITECTURE.md:257`). The pure
 * function above is the part `lib` owns; the registry lookup is a service
 * concern, so it moved to `server/services/completion-budget-lookup.ts` while the
 * registry stays private to the service layer.
 *
 * The type-only import of `AgenticOrchestratorEvent` in `agentic-sse-map.ts` and
 * the misplacements in `incubator-brainstorm.ts` / `task-agent-route-runner.ts`
 * are unchanged: type-only imports are erased and are not a runtime dependency,
 * and relocating the other two moves the prompt-assembly and SSE-route seams,
 * which is a larger change than a boundary fix.
 */
export function computeCompletionBudget(
  contextWindow: number | undefined,
  providerId: string,
  messages: ChatMessage[],
  purpose: CompletionPurpose,
): number | undefined {
  return completionBudgetFromPromptTokens(
    contextWindow ?? contextFallback(providerId),
    estimateChatMessagesTokens(messages),
    purpose,
    env.MAX_OUTPUT_TOKENS,
  );
}
