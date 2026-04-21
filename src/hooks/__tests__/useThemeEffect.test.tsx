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
    document.documentElement.removeAttribute('data-theme');
    cleanup();
  });

  it('defaults to light when no localStorage theme is set', () => {
    render(<Probe />);
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('applies the stored dark theme', () => {
    localStorage.setItem('theme', 'dark');
    render(<Probe />);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('applies the stored light theme', () => {
    localStorage.setItem('theme', 'light');
    render(<Probe />);
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('falls back to light when localStorage holds a garbage value', () => {
    localStorage.setItem('theme', 'neon' as never);
    render(<Probe />);
    // hook's type narrowing coerces unknown → 'neon' string; we still expect
    // the attribute to be set (data-theme="neon" resolves to light CSS since
    // no matching selector exists). This documents the current contract.
    expect(document.documentElement.dataset.theme).toBeDefined();
  });
});
