import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PromptKey } from '../../../src/lib/prompts/defaults.ts';

vi.mock('../../db/prompts.ts', () => ({
  getPromptBody: vi.fn(async (key: PromptKey) => `REMOTE:${key}`),
}));

import { getPromptBody } from '../../db/prompts.ts';
import { sanitizePromptOverrides, createResolvePromptBody } from '../prompt-overrides.ts';

describe('sanitizePromptOverrides', () => {
  it('returns undefined for undefined input', () => {
    expect(sanitizePromptOverrides(undefined)).toBeUndefined();
  });

  it('returns undefined when no valid entries remain', () => {
    expect(
      sanitizePromptOverrides({
        'not-a-prompt-key': 'x',
        'designer-direct-system': '',
      } as Record<string, string>),
    ).toBeUndefined();
  });

  it('keeps only known PromptKey entries with non-empty strings', () => {
    expect(
      sanitizePromptOverrides({
        'designer-direct-system': 'local-body',
        'not-a-real-key': 'noise',
        'evaluator-design-quality': '',
      }),
    ).toEqual({ 'designer-direct-system': 'local-body' });
  });
});

describe('createResolvePromptBody', () => {
  beforeEach(() => {
    vi.mocked(getPromptBody).mockClear();
  });

  it('returns getPromptBody when overrides are undefined', async () => {
    const resolve = createResolvePromptBody(undefined);
    await expect(resolve('agents-md-file')).resolves.toBe('REMOTE:agents-md-file');
    expect(getPromptBody).toHaveBeenCalledTimes(1);
    expect(getPromptBody).toHaveBeenCalledWith('agents-md-file');
  });

  it('uses override text when key is present in partial map', async () => {
    const resolve = createResolvePromptBody({
      'designer-direct-system': 'OVERRIDE',
    });
    await expect(resolve('designer-direct-system')).resolves.toBe('OVERRIDE');
    expect(getPromptBody).not.toHaveBeenCalled();
  });

  it('falls back to getPromptBody for keys not overridden', async () => {
    const resolve = createResolvePromptBody({
      'designer-direct-system': 'OVERRIDE',
    });
    await expect(resolve('designer-hypothesis-inputs')).resolves.toBe('REMOTE:designer-hypothesis-inputs');
    expect(getPromptBody).toHaveBeenCalledWith('designer-hypothesis-inputs');
  });
});
