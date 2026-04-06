import { describe, expect, it } from 'vitest';
import { parsePromptKey } from '../prompt-log-mapping';
import type { LlmLogEntry } from '../../api/types';
import type { PromptKey } from '../../stores/prompt-store';

/** Mirrors historical `prompt-log-mapping` helper — logic kept in tests only (no production call sites). */
function promptKeyFromLlmLogEntry(entry: LlmLogEntry): PromptKey | null {
  const { source, phase = '' } = entry;

  if (source === 'incubator') return 'hypotheses-generator-system';

  if (source === 'designSystem') return 'design-system-extract-system';

  if (source === 'agentCompaction') return 'agent-context-compaction';

  if (source === 'evaluator') {
    if (phase.includes('design')) return 'evaluator-design-quality';
    if (phase.includes('strategy')) return 'evaluator-strategy-fidelity';
    if (phase.includes('implementation')) return 'evaluator-implementation';
    return null;
  }

  if (source === 'builder') {
    if (phase === 'Single-shot generate') return 'designer-agentic-system';
    if (phase === 'agentic_turn' || phase === 'revision') return 'designer-agentic-system';
    return null;
  }

  return null;
}

function baseEntry(overrides: Partial<LlmLogEntry>): LlmLogEntry {
  return {
    id: '1',
    timestamp: new Date().toISOString(),
    durationMs: 100,
    source: 'other',
    provider: 'openrouter',
    model: 'x',
    systemPrompt: '',
    userPrompt: '',
    response: '',
    ...overrides,
  };
}

describe('prompt-log-mapping', () => {
  it('parsePromptKey accepts canonical keys', () => {
    expect(parsePromptKey('hypotheses-generator-system')).toBe('hypotheses-generator-system');
    expect(parsePromptKey('not_a_key')).toBeNull();
  });

  it('parsePromptKey maps pre-rename Langfuse names to canonical keys', () => {
    expect(parsePromptKey('compilerSystem')).toBe('hypotheses-generator-system');
    expect(parsePromptKey('variant')).toBe('designer-hypothesis-inputs');
  });

  it('maps incubator, designSystem, and agent compaction', () => {
    expect(promptKeyFromLlmLogEntry(baseEntry({ source: 'incubator' }))).toBe(
      'hypotheses-generator-system',
    );
    expect(promptKeyFromLlmLogEntry(baseEntry({ source: 'designSystem' }))).toBe(
      'design-system-extract-system',
    );
    expect(promptKeyFromLlmLogEntry(baseEntry({ source: 'agentCompaction' }))).toBe(
      'agent-context-compaction',
    );
  });

  it('maps evaluator by phase', () => {
    expect(
      promptKeyFromLlmLogEntry(
        baseEntry({ source: 'evaluator', phase: 'design rubric' }),
      ),
    ).toBe('evaluator-design-quality');
    expect(
      promptKeyFromLlmLogEntry(
        baseEntry({ source: 'evaluator', phase: 'strategy' }),
      ),
    ).toBe('evaluator-strategy-fidelity');
    expect(
      promptKeyFromLlmLogEntry(
        baseEntry({ source: 'evaluator', phase: 'implementation check' }),
      ),
    ).toBe('evaluator-implementation');
    expect(promptKeyFromLlmLogEntry(baseEntry({ source: 'evaluator', phase: 'unknown' }))).toBeNull();
  });

  it('maps builder phases', () => {
    expect(
      promptKeyFromLlmLogEntry(
        baseEntry({ source: 'builder', phase: 'Single-shot generate' }),
      ),
    ).toBe('designer-agentic-system');
    expect(
      promptKeyFromLlmLogEntry(baseEntry({ source: 'builder', phase: 'agentic_turn' })),
    ).toBe('designer-agentic-system');
    expect(
      promptKeyFromLlmLogEntry(baseEntry({ source: 'builder', phase: 'revision' })),
    ).toBe('designer-agentic-system');
    expect(promptKeyFromLlmLogEntry(baseEntry({ source: 'builder', phase: 'other' }))).toBeNull();
  });
});
