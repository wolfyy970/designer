/**
 * Tailwind-drift guard: scans product source for utility classes that bypass
 * the design system's tokens and type scale.
 *
 * Forbidden (with rationale):
 *   - `font-bold` / `font-light` — DESIGN_SYSTEM.md + DESIGN-SYSTEM-BLUEPRINT.md
 *     standardize on `font-medium` / `font-semibold`. Bold/light cause tone shifts
 *     that do not match the Indigo triad.
 *   - `bg-[#...]` / `text-[#...]` / `border-[#...]` / `ring-[#...]` — arbitrary hex
 *     bypasses the token pipeline; will not flip in dark mode.
 *   - Raw Tailwind palette (`bg-gray-500`, `text-indigo-600`, …) — bypasses the
 *     semantic layer in globals.css.
 *
 * Scope: `src/**` .tsx / .ts — excluding tests, __mocks__, and the dev kitchen sink.
 * The design-system package is allowed its own utility scope and is not scanned here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { join, resolve, relative, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const srcDir = resolve(repoRoot, 'src');

const RAW_TAILWIND_PALETTE = [
  'gray', 'slate', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
];

interface Rule {
  name: string;
  pattern: RegExp;
}

const RULES: Rule[] = [
  { name: 'font-bold (use font-medium/semibold)', pattern: /\bfont-bold\b/ },
  { name: 'font-light (use font-medium)', pattern: /\bfont-light\b/ },
  {
    name: 'arbitrary hex color utility',
    pattern: /\b(?:bg|text|border|ring)-\[#[0-9a-fA-F]{3,8}\]/,
  },
  {
    name: 'raw Tailwind palette (use semantic tokens)',
    pattern: new RegExp(
      `\\b(?:bg|text|border|ring|from|to|via|fill|stroke|decoration|outline|divide|placeholder|caret|accent|shadow)-(?:${RAW_TAILWIND_PALETTE.join('|')})-\\d+\\b`,
    ),
  },
];

const SKIP_DIRS = new Set(['__tests__', '__mocks__', 'test-support']);
const SKIP_FILES = new Set(['DesignTokensKitchenSink.tsx']);
const SCAN_EXT = new Set(['.tsx', '.ts']);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const stat = statSync(p);
    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      walk(p, out);
    } else if (SCAN_EXT.has(extname(entry)) && !SKIP_FILES.has(entry)) {
      out.push(p);
    }
  }
  return out;
}

interface Hit {
  file: string;
  line: number;
  rule: string;
  match: string;
}

function scanFile(absPath: string): Hit[] {
  const src = readFileSync(absPath, 'utf8');
  const rel = relative(repoRoot, absPath);
  const hits: Hit[] = [];
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const rule of RULES) {
      const m = rule.pattern.exec(line);
      if (m) hits.push({ file: rel, line: i + 1, rule: rule.name, match: m[0] });
    }
  }
  return hits;
}

describe('tailwind-drift guard — product source must stay on DS tokens', () => {
  it('no forbidden utilities in src/**/*.{ts,tsx}', () => {
    const files = walk(srcDir);
    const hits = files.flatMap(scanFile);
    const formatted = hits.map((h) => `  ${h.file}:${h.line}  ${h.rule}  →  ${h.match}`).join('\n');
    expect(
      hits,
      hits.length > 0
        ? `Found ${hits.length} tailwind-drift violation(s):\n${formatted}\n\nFix by migrating to a DS atom or a semantic token. See DESIGN_SYSTEM.md.`
        : '',
    ).toEqual([]);
  });
});
