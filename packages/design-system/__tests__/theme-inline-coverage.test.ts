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
 * Extract every body of `<header-pattern> { ... }` in `css`, tracking brace
 * depth so nested braces (at-rules, nested selectors) don't truncate the
 * match early. Matches every occurrence, not just the first — a file with
 * multiple `:root` scopes (e.g. `:root[data-density="compact"]`) parses
 * correctly.
 */
function extractBlockBodies(css: string, header: RegExp): string[] {
  const headerRe = new RegExp(header.source, 'g');
  const bodies: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(css)) !== null) {
    const open = css.indexOf('{', m.index);
    if (open < 0) break;
    let depth = 1;
    let i = open + 1;
    while (i < css.length && depth > 0) {
      const ch = css[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      i++;
    }
    if (depth === 0) bodies.push(css.slice(open + 1, i - 1));
    headerRe.lastIndex = i;
  }
  return bodies;
}

function extractThemeInlineVars(css: string): Set<string> {
  const bodies = extractBlockBodies(css, /@theme\s+inline\s*\{/);
  if (bodies.length === 0) {
    throw new Error('No @theme inline block found in globals.css');
  }
  const vars = new Set<string>();
  for (const body of bodies) {
    for (const v of extractAllVars(body)) vars.add(v);
  }
  return vars;
}

function extractRootBlockVars(css: string): Set<string> {
  const bodies = extractBlockBodies(css, /:root\s*\{/);
  const vars = new Set<string>();
  for (const body of bodies) {
    for (const v of extractAllVars(body)) vars.add(v);
  }
  return vars;
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
