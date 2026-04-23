import { describe, it, expect, beforeEach } from 'vitest';
import { useThinkingDefaultsStore } from '../thinking-defaults-store';
import { THINKING_TASKS } from '../../lib/thinking-defaults';

describe('useThinkingDefaultsStore', () => {
  beforeEach(() => {
    useThinkingDefaultsStore.getState().resetAll();
  });

  it('starts with an empty override per task', () => {
    const { overrides } = useThinkingDefaultsStore.getState();
    for (const t of THINKING_TASKS) {
      expect(overrides[t]).toEqual({});
    }
  });

  it('persists a level override without affecting budget', () => {
    useThinkingDefaultsStore.getState().setLevel('design', 'xhigh');
    expect(useThinkingDefaultsStore.getState().overrides.design).toEqual({ level: 'xhigh' });
  });

  it('persists a budget override without affecting level', () => {
    useThinkingDefaultsStore.getState().setBudgetTokens('hypothesis', 10_000);
    expect(useThinkingDefaultsStore.getState().overrides.hypothesis).toEqual({
      budgetTokens: 10_000,
    });
  });

  it('both overrides coexist', () => {
    const s = useThinkingDefaultsStore.getState();
    s.setLevel('incubate', 'high');
    s.setBudgetTokens('incubate', 4096);
    expect(useThinkingDefaultsStore.getState().overrides.incubate).toEqual({
      level: 'high',
      budgetTokens: 4096,
    });
  });

  it('setting a field to undefined clears it', () => {
    const s = useThinkingDefaultsStore.getState();
    s.setLevel('evaluator', 'medium');
    s.setBudgetTokens('evaluator', 2048);
    s.setLevel('evaluator', undefined);
    expect(useThinkingDefaultsStore.getState().overrides.evaluator).toEqual({ budgetTokens: 2048 });
  });

  it('resetTask clears a single task without disturbing siblings', () => {
    const s = useThinkingDefaultsStore.getState();
    s.setLevel('design', 'high');
    s.setLevel('inputs', 'low');
    s.resetTask('design');
    expect(useThinkingDefaultsStore.getState().overrides.design).toEqual({});
    expect(useThinkingDefaultsStore.getState().overrides.inputs).toEqual({ level: 'low' });
  });

  it('resetAll clears every task', () => {
    const s = useThinkingDefaultsStore.getState();
    s.setLevel('design', 'high');
    s.setBudgetTokens('inputs', 1024);
    s.resetAll();
    for (const t of THINKING_TASKS) {
      expect(useThinkingDefaultsStore.getState().overrides[t]).toEqual({});
    }
  });
});
