import { describe, it, expect } from 'vitest';
import { getActivePromptOverrides, spreadPromptOverrides } from '../prompt-overrides-store';
import type { PromptKey } from '../../lib/prompts/defaults';

describe('spreadPromptOverrides', () => {
  it('returns empty object when overrides undefined', () => {
    expect(spreadPromptOverrides(undefined)).toEqual({});
  });

  it('wraps non-empty map as promptOverrides', () => {
    const o = { 'designer-direct-system': 'x' };
    expect(spreadPromptOverrides(o)).toEqual({ promptOverrides: o });
  });
});

describe('getActivePromptOverrides', () => {
  it('returns undefined when there are no usable entries', () => {
    expect(getActivePromptOverrides({})).toBeUndefined();
    expect(
      getActivePromptOverrides({
        'designer-direct-system': '',
      } as Partial<Record<PromptKey, string>>),
    ).toBeUndefined();
    expect(
      getActivePromptOverrides({
        'designer-direct-system': '   ',
      } as Partial<Record<PromptKey, string>>),
    ).toBeUndefined();
  });

  it('includes keys whose trimmed body is non-empty, preserving original string', () => {
    expect(
      getActivePromptOverrides({
        'designer-direct-system': '  x  ',
      }),
    ).toEqual({ 'designer-direct-system': '  x  ' });
  });
});
