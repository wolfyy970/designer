import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import rawBudget from '../../../config/completion-budget.json';
import { completionBudgetFromPromptTokens, CompletionBudgetFileSchema } from '../completion-budget.ts';

describe('completionBudgetFromPromptTokens', () => {
  it('subtracts prompt and compile margin from context', () => {
    const b = completionBudgetFromPromptTokens(100_000, 20_000, 'incubate', undefined);
    expect(b).toBe(100_000 - 20_000 - 1_536);
  });

  it('uses larger margin for agent_turn', () => {
    const compile = completionBudgetFromPromptTokens(50_000, 10_000, 'incubate', undefined);
    const agent = completionBudgetFromPromptTokens(50_000, 10_000, 'agent_turn', undefined);
    expect(agent!).toBeLessThan(compile!);
  });

  it('returns undefined when window is exhausted', () => {
    expect(
      completionBudgetFromPromptTokens(8_000, 20_000, 'agent_turn', undefined),
    ).toBeUndefined();
  });

  it('applies product cap', () => {
    expect(completionBudgetFromPromptTokens(200_000, 1_000, 'default', 8192)).toBe(8192);
  });
});

describe('completion-budget.json', () => {
  it('round-trips through CompletionBudgetFileSchema', () => {
    expect(CompletionBudgetFileSchema.safeParse(rawBudget).success).toBe(true);
  });

  it('rejects minCompletion < 1', () => {
    const bad = { ...rawBudget, minCompletion: 0 };
    expect(() => CompletionBudgetFileSchema.parse(bad)).toThrow(z.ZodError);
  });

  it('rejects a negative margin', () => {
    const bad = { ...rawBudget, margins: { ...rawBudget.margins, incubate: -1 } };
    expect(() => CompletionBudgetFileSchema.parse(bad)).toThrow(z.ZodError);
  });

  it('rejects unknown top-level keys', () => {
    const bad = { ...rawBudget, unexpected: true };
    expect(() => CompletionBudgetFileSchema.parse(bad)).toThrow(z.ZodError);
  });
});
