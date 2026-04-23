/**
 * Single source of truth for light/dark theme control.
 * Storage key and apply logic live here so app code, tests, and the
 * pre-hydration script in `index.html` stay consistent.
 */
export type Theme = 'light' | 'dark';
export const THEME_STORAGE_KEY = 'theme';
export const DEFAULT_THEME: Theme = 'dark';

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

export function readStoredTheme(): Theme {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(raw) ? raw : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyThemeToDocument(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function writeStoredTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // localStorage unavailable (private mode, SSR) — class toggle still wins.
  }
}

/** Read the active theme from the `.dark` class on <html>. Safe on SSR. */
export function getActiveTheme(): Theme {
  if (typeof document === 'undefined') return DEFAULT_THEME;
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}
