/**
 * Multi-strategy fallback when Pi's edit tool cannot find `oldText` in the file.
 * Used only on "Could not find..." errors — duplicate-match errors are not retried.
 *
 * Strategies run in order; the first that yields a **unique** region wins.
 */

export type CascadeEdit = { oldText: string; newText: string };

function normalizeLf(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** Strip leading whitespace per line and compare; map back to exact file slice. */
export function strategy1LeadingWhitespaceOnly(fileContent: string, oldText: string): string | null {
  const fileLines = fileContent.split('\n');
  const needleLines = oldText.split('\n');
  if (needleLines.length === 0) return null;

  const normalizedNeedle = needleLines.map((l) => l.replace(/^\s+/, ''));
  const matches: number[] = [];

  for (let i = 0; i <= fileLines.length - needleLines.length; i++) {
    let ok = true;
    for (let j = 0; j < needleLines.length; j++) {
      const fileLineNorm = fileLines[i + j].replace(/^\s+/, '');
      if (fileLineNorm !== normalizedNeedle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) matches.push(i);
  }

  if (matches.length !== 1) return null;
  const start = matches[0]!;
  return fileLines.slice(start, start + needleLines.length).join('\n');
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Collapse whitespace in file slices and match against collapsed oldText.
 * Window length is bounded around the model's line count to stay fast.
 */
export function strategy2CollapsedWhitespace(fileContent: string, oldText: string): string | null {
  const target = collapseWhitespace(oldText);
  if (target === '') return null;

  const lines = fileContent.split('\n');
  const needleLineCount = oldText.split('\n').length;
  const minLen = Math.max(1, needleLineCount - 3);
  const maxLen = Math.min(lines.length, needleLineCount + 3);

  const matches: string[] = [];
  for (let s = 0; s < lines.length; s++) {
    for (let len = minLen; len <= maxLen && s + len <= lines.length; len++) {
      const chunk = lines.slice(s, s + len).join('\n');
      if (collapseWhitespace(chunk) === target) {
        matches.push(chunk);
      }
    }
  }

  const unique = [...new Set(matches)];
  return unique.length === 1 ? unique[0]! : null;
}

/** Per-line `.trim()` equality with fixed window = number of lines in oldText. */
export function strategy3LineTrimAnchors(fileContent: string, oldText: string): string | null {
  const fileLines = fileContent.split('\n');
  const needleLines = oldText.split('\n');
  if (needleLines.length === 0) return null;

  const L = needleLines.length;
  const blocks: string[] = [];

  for (let i = 0; i <= fileLines.length - L; i++) {
    let ok = true;
    for (let k = 0; k < L; k++) {
      if (fileLines[i + k].trim() !== needleLines[k].trim()) {
        ok = false;
        break;
      }
    }
    if (ok) {
      blocks.push(fileLines.slice(i, i + L).join('\n'));
    }
  }

  if (blocks.length !== 1) return null;
  return blocks[0]!;
}

/**
 * For each edit whose `oldText` is not an exact substring of `fileContent`, try strategies 1→2→3.
 * Returns corrected `edits` for Pi retry, or `null` if any edit cannot be resolved uniquely.
 */
export function attemptMatchCascade(fileContent: string, edits: CascadeEdit[]): CascadeEdit[] | null {
  const file = normalizeLf(fileContent);
  const corrected: CascadeEdit[] = [];

  for (const e of edits) {
    const oldNorm = normalizeLf(e.oldText);

    const fixed =
      strategy1LeadingWhitespaceOnly(file, oldNorm) ??
      strategy2CollapsedWhitespace(file, oldNorm) ??
      strategy3LineTrimAnchors(file, oldNorm);

    if (!fixed || fixed === e.oldText) {
      return null;
    }
    corrected.push({ oldText: fixed, newText: e.newText });
  }

  return corrected;
}

/** Fold Pi-style top-level oldText/newText into edits[] (mirrors `prepareEditArguments`). */
export function normalizeEditToolParams(params: unknown): { path: string; edits: CascadeEdit[] } | null {
  if (!params || typeof params !== 'object') return null;
  const p = params as Record<string, unknown>;
  const pathVal = typeof p.path === 'string' ? p.path : '';
  const edits: CascadeEdit[] = Array.isArray(p.edits) ? [...(p.edits as CascadeEdit[])] : [];
  if (typeof p.oldText === 'string' && typeof p.newText === 'string') {
    edits.push({ oldText: p.oldText, newText: p.newText });
  }
  if (edits.length === 0) return null;
  for (const e of edits) {
    if (typeof e.oldText !== 'string' || typeof e.newText !== 'string') return null;
  }
  return { path: pathVal, edits };
}

/** Pi edit "not found" errors (English strings from pi-coding-agent edit-diff). */
export function isEditNotFoundError(message: string): boolean {
  return /could not find/i.test(message);
}
