/**
 * Build renderable unified-diff lines from two bodies (jsdiff structuredPatch).
 */
import { structuredPatch } from 'diff';

type DiffLineKind = 'context' | 'add' | 'remove' | 'header';

export type DiffLine = { kind: DiffLineKind; text: string };

const DIFF_CONTEXT = 3;

/** Turn live vs winner bodies into colored line entries (includes @@ hunk headers). */
export function buildUnifiedDiffLines(liveBody: string, winnerBody: string): DiffLine[] {
  const patch = structuredPatch('live', 'winner', liveBody, winnerBody, '', '', { context: DIFF_CONTEXT });
  if (patch.hunks.length === 0) return [];
  const out: DiffLine[] = [];
  for (const h of patch.hunks) {
    out.push({
      kind: 'header',
      text: `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`,
    });
    for (const line of h.lines) {
      const c = line.charAt(0);
      if (c === '+') out.push({ kind: 'add', text: line });
      else if (c === '-') out.push({ kind: 'remove', text: line });
      else out.push({ kind: 'context', text: line });
    }
  }
  return out;
}
