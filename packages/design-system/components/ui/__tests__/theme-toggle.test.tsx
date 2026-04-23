import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeToggle } from '../theme-toggle';
import { THEME_STORAGE_KEY } from '../../../lib/theme';

vi.mock('@radix-ui/react-slot', () => ({
  Slot: ({ children }: { children: React.ReactNode }) => children as React.ReactElement,
}));

beforeEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.classList.remove('dark');
});

afterEach(() => {
  cleanup();
});

describe('ThemeToggle', () => {
  it('reflects dark state when .dark is on <html>', () => {
    document.documentElement.classList.add('dark');
    render(<ThemeToggle />);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.getAttribute('aria-label')).toBe('Switch to light mode');
  });

  it('reflects light state when .dark is absent', () => {
    render(<ThemeToggle />);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(btn.getAttribute('aria-label')).toBe('Switch to dark mode');
  });

  it('toggles document class and persists on click (uncontrolled)', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole('button'));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('calls onChange and does not write to storage when controlled', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ThemeToggle value="dark" onChange={onChange} />);
    await user.click(screen.getByRole('button'));
    expect(onChange).toHaveBeenCalledWith('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });
});
