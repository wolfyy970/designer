import { useEffect } from 'react';

/** Applies the persisted theme (light/dark) via .dark class on <html>. Default: light. */
export function useThemeEffect() {
  useEffect(() => {
    const stored = (localStorage.getItem('theme') as 'light' | 'dark' | null) ?? 'light';
    document.documentElement.classList.toggle('dark', stored === 'dark');
  }, []);
}
