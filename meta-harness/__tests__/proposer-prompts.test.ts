import { describe, expect, it } from 'vitest';
import { systemPromptForMode } from '../proposer-prompts.ts';

/** Regression: all modes share explicit refine-on-leader vs explore framing. */
describe('systemPromptForMode', () => {
  it.each(['incubate', 'design', 'e2e', 'inputs'] as const)('mode %s includes refine/explore strategy', (mode) => {
    const s = systemPromptForMode(mode);
    expect(s).toContain('refine-on-leader');
    expect(s).toContain('explore');
    expect(s).toMatch(/write_skill|write_system_prompt/);
  });
});
