import { describe, it, expect } from 'vitest';
import { getActivePromptOverrides } from '../prompt-overrides-store';
import type { PromptKey } from '../../lib/prompts/defaults';

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
