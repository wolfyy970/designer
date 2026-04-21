import { useEffect } from 'react';

/** Applies the persisted theme (light/dark) via data-theme on <html>. Default: light. */
export function useThemeEffect() {
  useEffect(() => {
    const stored = (localStorage.getItem('theme') as 'light' | 'dark' | null) ?? 'light';
    document.documentElement.dataset.theme = stored;
  }, []);
}
