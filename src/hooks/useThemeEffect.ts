import { useEffect } from 'react';
import { applyThemeToDocument, readStoredTheme } from '@ds/lib/theme';

/** Applies the persisted theme (light/dark) via .dark class on <html>. Default: dark. */
export function useThemeEffect() {
  useEffect(() => {
    applyThemeToDocument(readStoredTheme());
  }, []);
}
