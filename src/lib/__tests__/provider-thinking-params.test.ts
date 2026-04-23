import { describe, it, expect } from 'vitest';
import {
  levelToEffort,
  openRouterThinkingFields,
  lmStudioThinkingFields,
} from '../provider-thinking-params';
import { THINKING_OFF } from '../thinking-defaults';

describe('levelToEffort', () => {
  it('returns null for off', () => {
    expect(levelToEffort('off')).toBeNull();
  });

  it('collapses minimal/low to "low"', () => {
    expect(levelToEffort('minimal')).toBe('low');
    expect(levelToEffort('low')).toBe('low');
  });

  it('passes medium through', () => {
    expect(levelToEffort('medium')).toBe('medium');
  });

  it('collapses high/xhigh to "high"', () => {
    expect(levelToEffort('high')).toBe('high');
    expect(levelToEffort('xhigh')).toBe('high');
  });
});

describe('openRouterThinkingFields', () => {
  it('returns an empty object when thinking is undefined', () => {
    expect(openRouterThinkingFields(undefined)).toEqual({});
  });

  it('returns an empty object when level is off', () => {
    expect(openRouterThinkingFields(THINKING_OFF)).toEqual({});
  });

  it('attaches reasoning.effort + max_tokens for low', () => {
    expect(openRouterThinkingFields({ level: 'low', budgetTokens: 2048 })).toEqual({
      reasoning: { effort: 'low', max_tokens: 2048 },
    });
  });

  it('attaches reasoning.effort=medium', () => {
    expect(openRouterThinkingFields({ level: 'medium', budgetTokens: 8192 })).toEqual({
      reasoning: { effort: 'medium', max_tokens: 8192 },
    });
  });

  it('attaches reasoning.effort=high for high + xhigh', () => {
    expect(openRouterThinkingFields({ level: 'high', budgetTokens: 16384 })).toEqual({
      reasoning: { effort: 'high', max_tokens: 16384 },
    });
    expect(openRouterThinkingFields({ level: 'xhigh', budgetTokens: 32768 })).toEqual({
      reasoning: { effort: 'high', max_tokens: 32768 },
    });
  });
});

describe('lmStudioThinkingFields', () => {
  it('returns an empty object when thinking is undefined', () => {
    expect(lmStudioThinkingFields(undefined)).toEqual({});
  });

  it('returns an empty object when level is off', () => {
    expect(lmStudioThinkingFields(THINKING_OFF)).toEqual({});
  });

  it('emits reasoning_effort string, omits budget (not widely supported locally)', () => {
    expect(lmStudioThinkingFields({ level: 'medium', budgetTokens: 8192 })).toEqual({
      reasoning_effort: 'medium',
    });
    expect(lmStudioThinkingFields({ level: 'xhigh', budgetTokens: 32768 })).toEqual({
      reasoning_effort: 'high',
    });
  });
});
