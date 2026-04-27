import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import rawFlags from '../../../config/feature-flags.json';
import { FeatureFlagsFileSchema, FEATURE_LOCKDOWN, FEATURE_AUTO_IMPROVE } from '../feature-flags';

describe('feature-flags.json', () => {
  it('round-trips through FeatureFlagsFileSchema', () => {
    expect(FeatureFlagsFileSchema.safeParse(rawFlags).success).toBe(true);
  });

  it('exported booleans match JSON values', () => {
    expect(FEATURE_LOCKDOWN).toBe(rawFlags.lockdown === 1);
    expect(FEATURE_AUTO_IMPROVE).toBe(rawFlags.autoImprove === 1);
  });

  it('rejects a value outside 0 or 1', () => {
    const bad = { ...rawFlags, lockdown: 2 };
    expect(() => FeatureFlagsFileSchema.parse(bad)).toThrow(z.ZodError);
  });

  it('rejects a boolean value (must be 0 or 1 integer)', () => {
    const bad = { ...rawFlags, autoImprove: true };
    expect(() => FeatureFlagsFileSchema.parse(bad)).toThrow(z.ZodError);
  });

  it('rejects unknown top-level keys', () => {
    const bad = { ...rawFlags, experimental: 1 };
    expect(() => FeatureFlagsFileSchema.parse(bad)).toThrow(z.ZodError);
  });
});
