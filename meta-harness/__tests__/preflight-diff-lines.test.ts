import { describe, expect, it } from 'vitest';
import { buildUnifiedDiffLines } from '../preflight-diff-lines.ts';

describe('buildUnifiedDiffLines', () => {
  it('marks added, removed, and context lines', () => {
    const lines = buildUnifiedDiffLines('keep\nold', 'keep\nnew');
    const kinds = lines.map((l) => l.kind);
    expect(kinds).toContain('remove');
    expect(kinds).toContain('add');
    expect(kinds.filter((k) => k === 'context').length).toBeGreaterThan(0);
  });

  it('returns no lines when bodies are identical', () => {
    expect(buildUnifiedDiffLines('same\n', 'same\n')).toEqual([]);
  });
});
