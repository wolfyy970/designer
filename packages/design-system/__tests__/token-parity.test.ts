import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const tokensCssPath = resolve(rootDir, '_generated-tokens.css');

/**
 * Extract all CSS custom property names declared under a given selector
 * block in a CSS file.
 */
function extractVars(css: string, selector: string): Set<string> {
  const vars = new Set<string>();
  const regex = new RegExp(`${selector}\\s*\\{([^}]+)\\}`, 'g');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(css)) !== null) {
    const block = match[1];
    const propRegex = /(--[\w-]+):/g;
    let propMatch: RegExpExecArray | null;
    while ((propMatch = propRegex.exec(block)) !== null) {
      vars.add(propMatch[1]);
    }
  }
  return vars;
}

/**
 * Tokens that are shared across light/dark themes by design (no dark override needed).
 */
const SHARED_THEME_TOKENS = new Set([
  // Typography
  '--font-sans',
  '--font-mono',
  '--font-logo',
  '--font-display',
  // Text sizes
  '--text-micro',
  '--text-nano',
  '--text-badge',
  '--text-pico',
  // Layout widths
  '--width-node',
  '--width-node-variant',
  '--width-sidebar',
  '--width-palette',
  '--width-header',
  '--width-canvas-title',
  '--width-canvas-title-min',
  '--width-model-trigger',
  '--width-inspector-tab',
  '--width-kitchen-sink-label',
  '--width-variant-inspector',
  // Layout heights
  '--height-header',
  '--height-prompt-editor-pane',
  // Min heights
  '--min-height-variant-node',
  '--min-height-hypothesis-shell',
  '--min-height-input-textarea',
  '--min-height-prompt-textarea',
  '--min-height-prompt-editor',
  '--min-height-hypothesis-textarea',
  // Max heights
  '--max-height-eval-scorecard',
  '--max-height-section-ghost-preview',
  '--max-height-modal',
  '--max-height-modal-tall',
  '--max-height-debug-export',
  '--max-height-timeline-scroll',
]);

describe('token parity between light (:root) and dark (.dark)', () => {
  it('every :root --color-* has a .dark counterpart', () => {
    const css = readFileSync(tokensCssPath, 'utf8');
    const rootVars = extractVars(css, ':root');
    const darkVars = extractVars(css, '\\.dark');

    const colorVars = Array.from(rootVars).filter((v) => v.startsWith('--color-'));
    const missing = colorVars.filter(
      (v) => !darkVars.has(v) && !SHARED_THEME_TOKENS.has(v),
    );

    expect(missing).toEqual([]);
  });
});
