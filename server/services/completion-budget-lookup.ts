/**
 * Resolve a model's context window and compute its per-call completion budget.
 *
 * Lives in `server/services` because it depends on the provider model registry.
 * Its previous home was `server/lib/completion-budget.ts`, which made that
 * module import upward into `server/services` — the one **runtime** violation of
 * the boundary rule stated in `ARCHITECTURE.md:257`. The pure budget math stays in
 * `lib`; the registry lookup belongs here.
 *
 * Behaviour is unchanged: same registry call, same fallback, same product cap.
 * Callers are the two provider adapters, which already live in this layer.
 */
import { getProviderModelContextWindow } from './provider-model-context.ts';
import {
  computeCompletionBudget,
  type CompletionPurpose,
} from '../lib/completion-budget.ts';
import type { ChatMessage } from '../../src/types/provider.ts';

export async function completionMaxTokensForChat(
  providerId: string,
  modelId: string,
  messages: ChatMessage[],
  purpose: CompletionPurpose,
): Promise<number | undefined> {
  const contextWindow = await getProviderModelContextWindow(providerId, modelId);
  return computeCompletionBudget(contextWindow, providerId, messages, purpose);
}
