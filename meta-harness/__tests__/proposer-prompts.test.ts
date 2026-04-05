import { describe, expect, it } from 'vitest';
import { systemPromptForMode } from '../proposer-prompts.ts';

/** Regression: all modes share explicit refine-on-leader vs explore framing. */
describe('systemPromptForMode', () => {
  it.each(['compile', 'design', 'e2e'] as const)('mode %s includes refine/explore strategy', (mode) => {
    const s = systemPromptForMode(mode);
    expect(s).toContain('refine-on-leader');
    expect(s).toContain('explore');
    expect(s).toContain('set_prompt_override');
  });
});
