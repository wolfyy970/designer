import { describe, it, expect } from 'vitest';
import { cn } from '../utils';

describe('cn', () => {
  it('preserves text-micro alongside text-white', () => {
    const result = cn('text-white', 'text-micro');
    expect(result).toContain('text-micro');
    expect(result).toContain('text-white');
  });

  it('preserves text-nano alongside text-accent', () => {
    const result = cn('text-accent', 'text-nano');
    expect(result).toContain('text-nano');
    expect(result).toContain('text-accent');
  });

  it('preserves text-badge alongside text-fg', () => {
    const result = cn('text-fg', 'text-badge');
    expect(result).toContain('text-badge');
    expect(result).toContain('text-fg');
  });

  it('preserves text-pico alongside text-success', () => {
    const result = cn('text-success', 'text-pico');
    expect(result).toContain('text-pico');
    expect(result).toContain('text-success');
  });

  it('handles empty inputs', () => {
    expect(cn()).toBe('');
    expect(cn('', null, undefined)).toBe('');
  });

  it('handles clsx array inputs', () => {
    const result = cn(['text-white', 'text-micro']);
    expect(result).toContain('text-micro');
    expect(result).toContain('text-white');
  });
});
