import { describe, it, expect } from 'vitest';
import { railClassFor } from '../node-shell-rail';

describe('railClassFor', () => {
  it('returns the sage rail for filled/ok state', () => {
    expect(railClassFor('success')).toBe('border-l-2 border-l-success');
  });

  it('returns the amber rail for empty-required state', () => {
    expect(railClassFor('warning')).toBe('border-l-2 border-l-warning');
  });

  it('returns an empty string when no rail is requested', () => {
    expect(railClassFor(null)).toBe('');
    expect(railClassFor(undefined)).toBe('');
  });
});
