import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/prompt-override-policy', () => ({
  isPromptOverrideEditingEnabled: false,
}));

import { getActivePromptOverrides } from '../prompt-overrides-store';

describe('getActivePromptOverrides (production UI / policy off)', () => {
  it('does not forward overrides to the API', () => {
    expect(
      getActivePromptOverrides({
        'designer-agentic-system': 'should-not-send',
      }),
    ).toBeUndefined();
  });
});
