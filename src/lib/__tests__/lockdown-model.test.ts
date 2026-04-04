import { describe, expect, it } from 'vitest';
import {
  LOCKDOWN_MODEL_ID,
  LOCKDOWN_PROVIDER_ID,
  parseLockdownEnvValue,
  pinModelCredentialsIfLockdown,
} from '../lockdown-model';

describe('parseLockdownEnvValue', () => {
  it('treats unset or empty as locked', () => {
    expect(parseLockdownEnvValue(undefined)).toBe(true);
    expect(parseLockdownEnvValue('')).toBe(true);
    expect(parseLockdownEnvValue('   ')).toBe(true);
  });

  it('unlocks only explicit false tokens (case-insensitive)', () => {
    expect(parseLockdownEnvValue('false')).toBe(false);
    expect(parseLockdownEnvValue('FALSE')).toBe(false);
    expect(parseLockdownEnvValue('0')).toBe(false);
    expect(parseLockdownEnvValue('no')).toBe(false);
    expect(parseLockdownEnvValue('Off')).toBe(false);
  });

  it('treats any other non-empty value as locked', () => {
    expect(parseLockdownEnvValue('true')).toBe(true);
    expect(parseLockdownEnvValue('TRUE')).toBe(true);
    expect(parseLockdownEnvValue('1')).toBe(true);
    expect(parseLockdownEnvValue('yes')).toBe(true);
  });
});

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
