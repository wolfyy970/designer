import { describe, expect, it } from 'vitest';
import {
  LOCKDOWN_MODEL_ID,
  LOCKDOWN_PROVIDER_ID,
  pinModelCredentialsIfLockdown,
} from '../lockdown-model';

describe('pinModelCredentialsIfLockdown', () => {
  it('passes through when lockdown is false', () => {
    const creds = [{ providerId: 'lmstudio', modelId: 'x', thinkingLevel: 'minimal' as const }];
    const out = pinModelCredentialsIfLockdown(creds, false);
    expect(out).toEqual([{ providerId: 'lmstudio', modelId: 'x', thinkingLevel: 'minimal' }]);
  });

  it('pins every lane when lockdown is true', () => {
    const creds = [
      { providerId: 'lmstudio', modelId: 'x', thinkingLevel: 'minimal' as const },
      { providerId: 'openrouter', modelId: 'other', thinkingLevel: 'high' as const },
    ];
    const out = pinModelCredentialsIfLockdown(creds, true);
    expect(out).toEqual([
      { providerId: LOCKDOWN_PROVIDER_ID, modelId: LOCKDOWN_MODEL_ID, thinkingLevel: 'minimal' },
      { providerId: LOCKDOWN_PROVIDER_ID, modelId: LOCKDOWN_MODEL_ID, thinkingLevel: 'high' },
    ]);
  });
});
