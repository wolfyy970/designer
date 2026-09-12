import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import rawFlags from '../../../config/feature-flags.json';
import { FeatureFlagsFileSchema, FEATURE_LOCKDOWN, FEATURE_AUTO_IMPROVE } from '../feature-flags';

function expectedFlag(value: 0 | 1 | 'auto'): boolean {
  if (value === 1) return true;
  if (value === 0) return false;
  return import.meta.env.PROD;
}

describe('feature-flags.json', () => {
  it('round-trips through FeatureFlagsFileSchema', () => {
    expect(FeatureFlagsFileSchema.safeParse(rawFlags).success).toBe(true);
  });

  it('exported booleans match resolved JSON values', () => {
    // Parsed rather than cast: a raw JSON import widens `0 | 1 | 'auto'` to
    // `string`, and casting that back would hide a config file that no longer
    // satisfies the schema. Parsing fails loudly instead.
    const parsed = FeatureFlagsFileSchema.parse(rawFlags);
    expect(FEATURE_LOCKDOWN).toBe(expectedFlag(parsed.lockdown));
    expect(FEATURE_AUTO_IMPROVE).toBe(expectedFlag(parsed.autoImprove));
  });

  it('accepts auto as an environment-resolved flag value', () => {
    expect(() => FeatureFlagsFileSchema.parse({ ...rawFlags, lockdown: 'auto' })).not.toThrow();
  });

  it('rejects a value outside 0, 1, or auto', () => {
    const bad = { ...rawFlags, lockdown: 2 };
    expect(() => FeatureFlagsFileSchema.parse(bad)).toThrow(z.ZodError);
  });

  it('rejects a boolean value (must be 0, 1, or auto)', () => {
    const bad = { ...rawFlags, autoImprove: true };
    expect(() => FeatureFlagsFileSchema.parse(bad)).toThrow(z.ZodError);
  });

  it('rejects unknown top-level keys', () => {
    const bad = { ...rawFlags, experimental: 1 };
    expect(() => FeatureFlagsFileSchema.parse(bad)).toThrow(z.ZodError);
  });
});
