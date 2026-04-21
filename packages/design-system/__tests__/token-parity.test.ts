import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const tokensCssPath = resolve(rootDir, '_generated-tokens.css');
const globalsCssPath = resolve(rootDir, 'globals.css');

/**
 * Extract `name → value` for every CSS custom property declared under the
 * given selector (supports repeated blocks; `[^}]+` is safe for the CSS we
 * parse because no declaration body contains nested braces).
 */
function extractTokens(css: string, selector: string): Map<string, string> {
  const tokens = new Map<string, string>();
  const blockRe = new RegExp(`${selector}\\s*\\{([^}]+)\\}`, 'g');
  let block: RegExpExecArray | null;
  while ((block = blockRe.exec(css)) !== null) {
    const propRe = /(--[\w-]+)\s*:\s*([^;]+);/g;
    let prop: RegExpExecArray | null;
    while ((prop = propRe.exec(block[1])) !== null) {
      tokens.set(prop[1], prop[2].trim());
    }
  }
  return tokens;
}

/**
 * A token is "theme-derived" when its right-hand side references another
 * `--color-*` var **and** doesn't also hard-code a literal color. A
 * color-mix between a theme var and a fixed hex is a bug class: the var
 * side flips with theme but the hex side stays put, producing a wash that
 * only looks right in one theme. Flagging those here forces the declaration
 * to either use `var(--color-*)` for the mix partner or migrate to
 * `tokens.json` with explicit light/dark values.
 */
function isThemeDerived(value: string): boolean {
  const hasThemeVar = /var\(\s*--color-[\w-]+/.test(value);
  const hasLiteralHex = /#[0-9a-fA-F]{3,8}\b/.test(value);
  return hasThemeVar && !hasLiteralHex;
}

/**
 * Color tokens whose light value is correct in both themes by design, so
 * a `.dark` counterpart would be redundant. Each entry should be defended
 * by a brief comment; if you're tempted to add a token here to make the
 * test pass, first ask whether that token actually looks right in dark
 * mode — usually the answer is "no" and it needs a real dark value in
 * `tokens.json`.
 */
const SHARED_COLOR_TOKENS = new Set<string>([
  // Dark semi-transparent scrim used by modal overlays; works on either
  // theme because it's already dark-on-whatever.
  '--color-overlay',
  // The preview iframe renders user-generated output on a fixed-white
  // canvas regardless of app theme — don't flip this.
  '--color-preview-canvas',
  // Media-chrome and preview-overlay stacks sit atop the (dark) preview
  // frame chrome; fixed-white alphas are intentional.
  '--color-media-chrome-hover',
  '--color-media-chrome-rail',
  '--color-media-chrome-text-dim',
  '--color-preview-overlay-hairline',
  '--color-preview-overlay-control-border',
  '--color-preview-overlay-control-border-hover',
  '--color-preview-overlay-text-faint',
  '--color-preview-overlay-text-muted',
  '--color-preview-overlay-text-soft',
]);

describe('token parity between light (:root) and dark (.dark)', () => {
  it('every fixed-value --color-* in :root has a .dark counterpart or is explicitly shared', () => {
    const tokensCss = readFileSync(tokensCssPath, 'utf8');
    const globalsCss = readFileSync(globalsCssPath, 'utf8');

    // Union across both files so a token declared in globals.css :root with a
    // dark override in _generated-tokens.css .dark (or vice versa) is treated
    // as paired.
    const rootTokens = new Map<string, string>([
      ...extractTokens(tokensCss, ':root'),
      ...extractTokens(globalsCss, ':root'),
    ]);
    const darkTokens = new Map<string, string>([
      ...extractTokens(tokensCss, '\\.dark'),
      ...extractTokens(globalsCss, '\\.dark'),
    ]);

    const needsParity = Array.from(rootTokens.entries()).filter(
      ([name, value]) =>
        name.startsWith('--color-') &&
        !isThemeDerived(value) &&
        !SHARED_COLOR_TOKENS.has(name),
    );

    const missing = needsParity
      .filter(([name]) => !darkTokens.has(name))
      .map(([name]) => name);

    expect(missing).toEqual([]);
  });
});
