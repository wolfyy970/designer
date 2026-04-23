import { useEffect, useState } from 'react';
import { getActiveTheme, type Theme } from './theme';

/**
 * Subscribe to the active theme (`dark` class on <html>). Updates whenever
 * any code flips the class — `ThemeToggle`, manual DOM edits, devtools,
 * a future system-preference listener, etc.
 */
export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(() => getActiveTheme());

  useEffect(() => {
    const root = document.documentElement;
    setTheme(getActiveTheme());
    const observer = new MutationObserver(() => setTheme(getActiveTheme()));
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return theme;
}
