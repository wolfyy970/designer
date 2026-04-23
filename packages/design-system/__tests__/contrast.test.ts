/**
 * WCAG contrast guard for foreground × background pairs across both themes.
 *
 * Rules enforced (per WCAG 2.1):
 *   - Body text (`fg` × `bg` / `surface` / `surface-raised`): ≥ 4.5 : 1
 *   - UI / large text (`fg-secondary`, `fg-muted`, `fg-faint`): ≥ 3.0 : 1
 *
 * Reads concrete hex values from `tokens.json` — keeps the test independent
 * of the derived-token layer in globals.css and of Tailwind utility wiring.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tokensPath = resolve(__dirname, '../tokens.json');

type Theme = 'light' | 'dark';
interface TokenLeaf { light: { value: string }; dark: { value: string } }
interface Tokens { color: Record<string, Record<string, TokenLeaf>> }

const tokens = JSON.parse(readFileSync(tokensPath, 'utf8')) as Tokens;

function hex(group: string, variant: string, theme: Theme): string {
  const node = tokens.color[group]?.[variant];
  if (!node) throw new Error(`token not found: color.${group}.${variant}`);
  return node[theme].value;
}

function relLuminance(hexStr: string): number {
  const h = hexStr.replace(/^#/, '');
  const n =
    h.length === 3
      ? h.split('').map((c) => parseInt(c + c, 16))
      : [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  const [r, g, b] = n.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

interface Pair {
  fg: [string, string];
  bg: [string, string];
  minRatio: number;
  role: string;
}

const PAIRS: Pair[] = [
  { fg: ['fg', 'base'], bg: ['bg', 'base'], minRatio: 4.5, role: 'body on canvas' },
  { fg: ['fg', 'base'], bg: ['surface', 'base'], minRatio: 4.5, role: 'body on paper' },
  { fg: ['fg', 'base'], bg: ['surface', 'raised'], minRatio: 4.5, role: 'body on raised card' },
  { fg: ['fg', 'secondary'], bg: ['bg', 'base'], minRatio: 4.5, role: 'secondary on canvas' },
  { fg: ['fg', 'secondary'], bg: ['surface', 'raised'], minRatio: 4.5, role: 'secondary on raised card' },
  { fg: ['fg', 'muted'], bg: ['bg', 'base'], minRatio: 4.5, role: 'muted on canvas (body)' },
  { fg: ['fg', 'muted'], bg: ['surface', 'raised'], minRatio: 4.5, role: 'muted on raised card (body)' },
  // `fg-faint` is intentionally scoped to large / UI decorative text — 3:1 only.
  { fg: ['fg', 'faint'], bg: ['bg', 'base'], minRatio: 3.0, role: 'faint on canvas (large/UI)' },
  { fg: ['fg', 'faint'], bg: ['surface', 'raised'], minRatio: 3.0, role: 'faint on raised card (large/UI)' },
  // Accent as interactive text should read as a link/button label.
  { fg: ['accent', '500'], bg: ['bg', 'base'], minRatio: 3.0, role: 'accent on canvas (UI)' },
  { fg: ['accent', '500'], bg: ['surface', 'raised'], minRatio: 3.0, role: 'accent on raised card (UI)' },
];

function hexAt(pair: [string, string], theme: Theme): string {
  return hex(pair[0], pair[1], theme);
}

describe('WCAG contrast — token pairs in both themes', () => {
  for (const theme of ['light', 'dark'] as const) {
    for (const p of PAIRS) {
      it(`${theme} / ${p.role} meets ≥ ${p.minRatio} : 1`, () => {
        const fgHex = hexAt(p.fg, theme);
        const bgHex = hexAt(p.bg, theme);
        const ratio = contrast(fgHex, bgHex);
        expect(
          ratio,
          `${theme}: color.${p.fg.join('.')} (${fgHex}) on color.${p.bg.join('.')} (${bgHex}) = ${ratio.toFixed(2)}:1, need ≥ ${p.minRatio}`,
        ).toBeGreaterThanOrEqual(p.minRatio);
      });
    }
  }
});
