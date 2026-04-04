import { describe, it, expect } from 'vitest';
import { bumpSemverPatch } from '../semver-bump-patch';

describe('bumpSemverPatch', () => {
  it('increments patch only', () => {
    expect(bumpSemverPatch('0.3.1')).toBe('0.3.2');
    expect(bumpSemverPatch('0.3.9')).toBe('0.3.10');
    expect(bumpSemverPatch('1.0.0')).toBe('1.0.1');
  });

  it('rejects non-numeric semver', () => {
    expect(() => bumpSemverPatch('0.3')).toThrow();
    expect(() => bumpSemverPatch('v0.3.1')).toThrow();
    expect(() => bumpSemverPatch('0.3.1-beta')).toThrow();
    expect(() => bumpSemverPatch('')).toThrow();
  });
});
