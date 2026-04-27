import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import rawDefaults from '../../../config/provider-defaults.json';
import {
  ProviderDefaultsFileSchema,
  DEFAULT_COMPILER_PROVIDER,
  DEFAULT_MODEL_ID,
} from '../provider-defaults';

describe('provider-defaults.json', () => {
  it('round-trips through ProviderDefaultsFileSchema', () => {
    expect(ProviderDefaultsFileSchema.safeParse(rawDefaults).success).toBe(true);
  });

  it('exported constants match JSON values', () => {
    expect(DEFAULT_COMPILER_PROVIDER).toBe(rawDefaults.compilerProvider);
    expect(DEFAULT_MODEL_ID).toBe(rawDefaults.modelId);
  });

  it('rejects an unknown provider', () => {
    const bad = { ...rawDefaults, compilerProvider: 'bogus' };
    expect(() => ProviderDefaultsFileSchema.parse(bad)).toThrow(z.ZodError);
  });

  it('rejects an empty modelId', () => {
    const bad = { ...rawDefaults, modelId: '' };
    expect(() => ProviderDefaultsFileSchema.parse(bad)).toThrow(z.ZodError);
  });

  it('rejects unknown top-level keys', () => {
    const bad = { ...rawDefaults, generationProvider: 'openrouter' };
    expect(() => ProviderDefaultsFileSchema.parse(bad)).toThrow(z.ZodError);
  });
});
