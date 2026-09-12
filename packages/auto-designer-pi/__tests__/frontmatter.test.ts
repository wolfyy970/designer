/**
 * Frontmatter parsing — the module that decides what the model is told.
 *
 * `loadDesignerSystemPrompt()` and `loadPackagePromptBody()` feed Pi's
 * `customPrompt` and every bundled task prompt through a stripped-frontmatter
 * body, so a parsing mistake here does not fail loudly: it silently injects
 * metadata into the prompt, or truncates the instructions.
 *
 * There were four implementations with two semantics. Measured divergence on the
 * same input (package `stripFrontmatter` vs server `splitFrontmatterMarkdown`):
 *
 *     input            package                    server
 *     LF               "BODY"                     "BODY"
 *     CRLF             "\r\nBODY"                 "BODY"        <-- diverges
 *     BOM              "---\nname: x\n---\nBODY"  "BODY"        <-- diverges
 *     BOM+CRLF         (raw, with BOM)            "BODY"        <-- diverges
 *     4-dash fence     "-\nBODY"                  null          <-- diverges
 *     leading blank    (unstripped)               null          <-- diverges
 *
 * A BOM is the dangerous one: `readFileSync(…, 'utf8')` keeps it, so the old
 * `text.startsWith('---')` was false, the raw YAML header was returned as the
 * system-prompt body, and metadata leaked into **every** agent session.
 *
 * Note on which line earns its keep: `lines[0].trim()` already strips a BOM
 * (`trim` removes U+FEFF), so the explicit BOM strip is belt-and-braces. The
 * CRLF normalization is the load-bearing part — removing both fails three of
 * these tests, removing only the BOM strip fails none. Recorded so nobody
 * "simplifies" the normalization away.
 *
 * These tests pin one implementation's behaviour. Only the shapes listed as
 * divergences above change relative to the package version; LF-only, no-BOM
 * files — i.e. every file currently in the repo — are unaffected.
 */
import { describe, expect, it } from 'vitest';

import { parseFrontmatter } from '../src/paths';

const CASES: Array<{ label: string; raw: string; body: string; yaml?: string }> = [
  {
    label: 'LF frontmatter',
    raw: '---\nname: x\n---\nBODY',
    body: 'BODY',
    yaml: 'name: x',
  },
  {
    label: 'CRLF frontmatter',
    raw: '---\r\nname: x\r\n---\r\nBODY',
    body: 'BODY',
    yaml: 'name: x',
  },
  {
    label: 'UTF-8 BOM before the fence',
    raw: '\uFEFF---\nname: x\n---\nBODY',
    body: 'BODY',
    yaml: 'name: x',
  },
  {
    label: 'BOM and CRLF together',
    raw: '\uFEFF---\r\nname: x\r\n---\r\nBODY',
    body: 'BODY',
    yaml: 'name: x',
  },
  {
    label: 'no frontmatter at all',
    raw: 'BODY only',
    body: 'BODY only',
    yaml: undefined,
  },
  {
    label: 'unterminated frontmatter is treated as body',
    raw: '---\nname: x\nBODY',
    body: '---\nname: x\nBODY',
    yaml: undefined,
  },
  {
    label: 'a later --- in the body is preserved',
    raw: '---\nname: x\n---\nBODY\n---\nmore',
    body: 'BODY\n---\nmore',
    yaml: 'name: x',
  },
];

describe('parseFrontmatter', () => {
  it.each(CASES)('parses $label', ({ raw, body, yaml }) => {
    const out = parseFrontmatter(raw);
    expect(out.body).toBe(body);
    if (yaml === undefined) expect(out.yaml).toBeUndefined();
    else expect(out.yaml).toBe(yaml);
  });

  it.each(CASES.filter((c) => c.yaml !== undefined))(
    'never leaks YAML metadata into the body for $label',
    ({ raw }) => {
      // The failure that matters: metadata reaching the system prompt.
      const { body } = parseFrontmatter(raw);
      expect(body).not.toMatch(/^---/);
      expect(body).not.toMatch(/^name:\s/m);
    },
  );

  it('strips leading blank lines after the closing fence', () => {
    expect(parseFrontmatter('---\nname: x\n---\n\n\nBODY').body).toBe('BODY');
  });

  it('handles a four-dash line as body content, not a closing fence', () => {
    // A closing fence is exactly `---`. `indexOf('\n---')` used to match the
    // first four-dash line and truncate the body to a single dash.
    const out = parseFrontmatter('---\nname: x\n----\nBODY');
    expect(out.body).toContain('BODY');
    expect(out.body).not.toBe('-\nBODY');
  });

  it('does not treat a leading blank line as frontmatter', () => {
    const out = parseFrontmatter('\n---\nname: x\n---\nBODY');
    expect(out.yaml).toBeUndefined();
    expect(out.body).toBe('\n---\nname: x\n---\nBODY');
  });

  it('normalizes CRLF inside the body', () => {
    expect(parseFrontmatter('---\nname: x\n---\r\nA\r\nB').body).toBe('A\nB');
  });

  it('returns the whole input as body for empty input', () => {
    expect(parseFrontmatter('')).toEqual({ body: '', yaml: undefined });
  });
});
