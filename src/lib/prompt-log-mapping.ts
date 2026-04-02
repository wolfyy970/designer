import type { LlmLogEntry } from '../api/types';
import { PROMPT_META, type PromptKey } from '../stores/prompt-store';

const KEY_SET = new Set<PromptKey>(PROMPT_META.map((m) => m.key));

export function parsePromptKey(raw: string): PromptKey | null {
  return KEY_SET.has(raw as PromptKey) ? (raw as PromptKey) : null;
}

/** Best-effort map from an observability LLM row to a Prompt Studio key. */
export function promptKeyFromLlmLogEntry(entry: LlmLogEntry): PromptKey | null {
  const { source, phase = '' } = entry;

  if (source === 'compiler') return 'compilerSystem';

  if (source === 'designSystem') return 'designSystemExtract';

  if (source === 'evaluator') {
    if (phase.includes('design')) return 'evalDesignSystem';
    if (phase.includes('strategy')) return 'evalStrategySystem';
    if (phase.includes('implementation')) return 'evalImplementationSystem';
    return null;
  }

  if (source === 'builder') {
    if (phase === 'Single-shot generate') return 'genSystemHtml';
    if (phase === 'agentic_turn' || phase === 'revision') return 'genSystemHtmlAgentic';
    return null;
  }

  return null;
}
