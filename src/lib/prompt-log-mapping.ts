import type { LlmLogEntry } from '../api/types';
import { LEGACY_PROMPT_KEY_ALIASES, PROMPT_META, type PromptKey } from '../stores/prompt-store';

const KEY_SET = new Set<PromptKey>(PROMPT_META.map((m) => m.key));

export function parsePromptKey(raw: string): PromptKey | null {
  if (KEY_SET.has(raw as PromptKey)) return raw as PromptKey;
  const mapped = LEGACY_PROMPT_KEY_ALIASES[raw as keyof typeof LEGACY_PROMPT_KEY_ALIASES];
  if (mapped && KEY_SET.has(mapped)) return mapped;
  return null;
}

/** Best-effort map from an observability LLM row to a Prompt Studio key. */
export function promptKeyFromLlmLogEntry(entry: LlmLogEntry): PromptKey | null {
  const { source, phase = '' } = entry;

  if (source === 'compiler') return 'hypotheses-generator-system';

  if (source === 'designSystem') return 'design-system-extract-system';

  if (source === 'agentCompaction') return 'agent-context-compaction';

  if (source === 'evaluator') {
    if (phase.includes('design')) return 'evaluator-design-quality';
    if (phase.includes('strategy')) return 'evaluator-strategy-fidelity';
    if (phase.includes('implementation')) return 'evaluator-implementation';
    return null;
  }

  if (source === 'builder') {
    if (phase === 'Single-shot generate') return 'designer-direct-system';
    if (phase === 'agentic_turn' || phase === 'revision') return 'designer-agentic-system';
    return null;
  }

  return null;
}
