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
  it('parsePromptKey accepts known keys', () => {
    expect(parsePromptKey('compilerSystem')).toBe('compilerSystem');
    expect(parsePromptKey('not_a_key')).toBeNull();
  });

  it('maps compiler, designSystem, and agent compaction', () => {
    expect(promptKeyFromLlmLogEntry(baseEntry({ source: 'compiler' }))).toBe('compilerSystem');
    expect(promptKeyFromLlmLogEntry(baseEntry({ source: 'designSystem' }))).toBe(
      'designSystemExtract',
    );
    expect(promptKeyFromLlmLogEntry(baseEntry({ source: 'agentCompaction' }))).toBe(
      'agentCompactionSystem',
    );
  });

  it('maps evaluator by phase', () => {
    expect(
      promptKeyFromLlmLogEntry(
        baseEntry({ source: 'evaluator', phase: 'design rubric' }),
      ),
    ).toBe('evalDesignSystem');
    expect(
      promptKeyFromLlmLogEntry(
        baseEntry({ source: 'evaluator', phase: 'strategy' }),
      ),
    ).toBe('evalStrategySystem');
    expect(
      promptKeyFromLlmLogEntry(
        baseEntry({ source: 'evaluator', phase: 'implementation check' }),
      ),
    ).toBe('evalImplementationSystem');
    expect(promptKeyFromLlmLogEntry(baseEntry({ source: 'evaluator', phase: 'unknown' }))).toBeNull();
  });

  it('maps builder phases', () => {
    expect(
      promptKeyFromLlmLogEntry(
        baseEntry({ source: 'builder', phase: 'Single-shot generate' }),
      ),
    ).toBe('genSystemHtml');
    expect(
      promptKeyFromLlmLogEntry(baseEntry({ source: 'builder', phase: 'agentic_turn' })),
    ).toBe('genSystemHtmlAgentic');
    expect(
      promptKeyFromLlmLogEntry(baseEntry({ source: 'builder', phase: 'revision' })),
    ).toBe('genSystemHtmlAgentic');
    expect(promptKeyFromLlmLogEntry(baseEntry({ source: 'builder', phase: 'other' }))).toBeNull();
  });
});
