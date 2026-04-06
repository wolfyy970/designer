import { describe, expect, it } from 'vitest';
import { completionBudgetFromPromptTokens } from '../completion-budget.ts';

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
