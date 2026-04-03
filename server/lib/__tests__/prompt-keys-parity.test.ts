import { describe, it, expect } from 'vitest';
import { PROMPT_KEYS } from '../prompts/defaults.ts';
import { PROMPT_DEFAULTS } from '../../../src/lib/prompts/shared-defaults.ts';

describe('PROMPT_KEYS vs PROMPT_DEFAULTS (seed parity)', () => {
  it('PROMPT_KEYS matches sorted PROMPT_DEFAULTS keys', () => {
    const fromDefaults = Object.keys(PROMPT_DEFAULTS).sort();
    expect([...PROMPT_KEYS].sort()).toEqual(fromDefaults);
  });
});
