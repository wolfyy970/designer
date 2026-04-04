import { describe, expect, it } from 'vitest';
import { parsePromptKey, promptKeyFromLlmLogEntry } from '../prompt-log-mapping';
import type { LlmLogEntry } from '../../api/types';

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

  it('maps compiler, designSystem, and agent compaction', () => {
    expect(promptKeyFromLlmLogEntry(baseEntry({ source: 'compiler' }))).toBe(
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
    ).toBe('designer-direct-system');
    expect(
      promptKeyFromLlmLogEntry(baseEntry({ source: 'builder', phase: 'agentic_turn' })),
    ).toBe('designer-agentic-system');
    expect(
      promptKeyFromLlmLogEntry(baseEntry({ source: 'builder', phase: 'revision' })),
    ).toBe('designer-agentic-system');
    expect(promptKeyFromLlmLogEntry(baseEntry({ source: 'builder', phase: 'other' }))).toBeNull();
  });
});
