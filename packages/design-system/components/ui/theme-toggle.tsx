import { useCallback } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button, type ButtonProps } from './button';
import { applyThemeToDocument, writeStoredTheme, type Theme } from '../../lib/theme';
import { useTheme } from '../../lib/use-theme';

export type ThemeToggleProps = Pick<ButtonProps, 'className' | 'size'> & {
  /** Controlled value — omit for uncontrolled (reads from DOM, writes localStorage). */
  value?: Theme;
  onChange?: (next: Theme) => void;
};

/**
 * Atomic theme switcher. Uncontrolled by default: reads the active theme
 * reactively from `<html>` and toggles it. Pass `value` + `onChange` for
 * a controlled variant.
 */
export function ThemeToggle({
  className,
  size = 'icon',
  value,
  onChange,
}: ThemeToggleProps) {
  const active = useTheme();
  const theme: Theme = value ?? active;

  const toggle = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    applyThemeToDocument(next);
    if (value === undefined) writeStoredTheme(next);
    onChange?.(next);
  }, [theme, value, onChange]);

  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  const Icon = theme === 'dark' ? Sun : Moon;

  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      aria-label={label}
      aria-pressed={theme === 'dark'}
      title={label}
      onClick={toggle}
      className={className}
    >
      <Icon size={16} aria-hidden />
    </Button>
  );
}
