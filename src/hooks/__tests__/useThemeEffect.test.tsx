/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { useThemeEffect } from '../useThemeEffect';

function Probe() {
  useThemeEffect();
  return null;
}

describe('useThemeEffect', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    cleanup();
  });

  it('defaults to dark when no localStorage theme is set', () => {
    render(<Probe />);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('applies the stored dark theme', () => {
    localStorage.setItem('theme', 'dark');
    render(<Probe />);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('applies the stored light theme', () => {
    localStorage.setItem('theme', 'light');
    render(<Probe />);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('falls back to dark when localStorage holds a garbage value', () => {
    localStorage.setItem('theme', 'neon' as never);
    render(<Probe />);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
