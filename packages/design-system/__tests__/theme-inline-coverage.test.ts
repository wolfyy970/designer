import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const globalsCssPath = resolve(rootDir, 'globals.css');
const tokensCssPath = resolve(rootDir, '_generated-tokens.css');

/**
 * Extract all CSS custom property names from a CSS text block.
 */
function extractAllVars(text: string): Set<string> {
  const vars = new Set<string>();
  const regex = /(--[\w-]+):/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    vars.add(match[1]);
  }
  return vars;
}

/**
 * Extract the content of an @theme inline { ... } block from CSS.
 */
function extractThemeInlineVars(css: string): Set<string> {
  const match = css.match(/@theme\s+inline\s*\{([^}]*)\}/s);
  if (!match) throw new Error('No @theme inline block found in globals.css');
  return extractAllVars(match[1]);
}

/**
 * Extract the content of a :root { ... } block from CSS.
 */
function extractRootBlockVars(css: string): Set<string> {
  const match = css.match(/:root\s*\{([^}]*)\}/s);
  if (!match) return new Set();
  return extractAllVars(match[1]);
}

/**
 * Tokens that are declared in :root but intentionally not exposed as Tailwind
 * utilities (used only in color-mix or other CSS functions).
 */
const THEME_INLINE_OPT_OUT = new Set([
  // Accent scale steps — used via var() in component CSS, not as direct
  // Tailwind utility classes (e.g. bg-accent-500 is not used; bg-accent is).
  '--color-accent-50',
  '--color-accent-100',
  '--color-accent-200',
  '--color-accent-300',
  '--color-accent-400',
  '--color-accent-500',
  '--color-accent-600',
  '--color-accent-700',
  '--color-accent-800',
  '--color-accent-900',
  '--color-accent-950',
]);

describe('@theme inline coverage', () => {
  it('every --color-* / --width-* / --height-* / --min-height-* / --max-height-* in :root appears in @theme inline', () => {
    const globalsCss = readFileSync(globalsCssPath, 'utf8');
    const tokensCss = readFileSync(tokensCssPath, 'utf8');

    const themeInlineVars = extractThemeInlineVars(globalsCss);

    // Collect vars from both globals.css :root and _generated-tokens.css :root
    const globalsRootVars = extractRootBlockVars(globalsCss);
    const tokensRootVars = extractRootBlockVars(tokensCss);
    const allRootVars = new Set([...globalsRootVars, ...tokensRootVars]);

    // Filter to token categories that should become Tailwind utilities
    const utilityPrefixes = ['--color-', '--width-', '--height-', '--min-height-', '--max-height-'];
    const shouldBeInTheme = Array.from(allRootVars).filter(
      (v) => utilityPrefixes.some((p) => v.startsWith(p)) && !THEME_INLINE_OPT_OUT.has(v),
    );

    const missing = shouldBeInTheme.filter((v) => !themeInlineVars.has(v));

    expect(missing).toEqual([]);
  });
});
