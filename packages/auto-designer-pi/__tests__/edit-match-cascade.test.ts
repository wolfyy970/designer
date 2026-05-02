import { describe, it, expect } from 'vitest';
import {
  attemptMatchCascade,
  isEditNotFoundError,
  normalizeEditToolParams,
  strategy1LeadingWhitespaceOnly,
  strategy2CollapsedWhitespace,
  strategy3LineTrimAnchors,
} from '../src/tools/edit-match-cascade';

describe('isEditNotFoundError', () => {
  it('matches Pi "could not find" copy case-insensitively', () => {
    expect(isEditNotFoundError('Could not find oldText in file')).toBe(true);
    expect(isEditNotFoundError('could not FIND substring')).toBe(true);
    expect(isEditNotFoundError('match too ambiguous')).toBe(false);
  });
});

describe('strategy1LeadingWhitespaceOnly', () => {
  it('returns the file slice when only leading whitespace differs and the match is unique', () => {
    const file = '  const x = 1;\n  const y = 2;\n';
    expect(strategy1LeadingWhitespaceOnly(file, 'const x = 1;')).toBe('  const x = 1;');
  });

  it('returns null on multiple matches', () => {
    const file = '  const x = 1;\n  const x = 1;\n';
    expect(strategy1LeadingWhitespaceOnly(file, 'const x = 1;')).toBeNull();
  });
});

describe('strategy2CollapsedWhitespace', () => {
  it('matches across collapsed-whitespace differences', () => {
    const file = 'foo   bar\nbaz';
    expect(strategy2CollapsedWhitespace(file, 'foo bar')).toBe('foo   bar');
  });
});

describe('strategy3LineTrimAnchors', () => {
  it('matches per-line trimmed equality with fixed window', () => {
    const file = 'a\n  b  \n c \nd';
    expect(strategy3LineTrimAnchors(file, 'b\nc')).toBe('  b  \n c ');
  });
});

describe('attemptMatchCascade', () => {
  it('resolves an oldText that only differs by leading whitespace', () => {
    const file = '    function add(a, b) {\n      return a + b;\n    }\n';
    const result = attemptMatchCascade(file, [
      { oldText: 'function add(a, b) {\n  return a + b;\n}', newText: 'function add(a, b) { return a + b; }' },
    ]);
    expect(result).not.toBeNull();
    expect(result![0]?.oldText).toBe('    function add(a, b) {\n      return a + b;\n    }');
  });

  it('returns null when no strategy yields a unique match', () => {
    const file = 'a\nb\nc';
    expect(attemptMatchCascade(file, [{ oldText: 'totally absent', newText: 'x' }])).toBeNull();
  });
});

describe('normalizeEditToolParams', () => {
  it('folds top-level oldText/newText into edits[]', () => {
    expect(
      normalizeEditToolParams({ path: 'a.ts', oldText: 'a', newText: 'b' }),
    ).toEqual({ path: 'a.ts', edits: [{ oldText: 'a', newText: 'b' }] });
  });

  it('preserves edits[] entries and appends top-level fallback', () => {
    expect(
      normalizeEditToolParams({
        path: 'a.ts',
        edits: [{ oldText: 'x', newText: 'y' }],
        oldText: 'a',
        newText: 'b',
      }),
    ).toEqual({
      path: 'a.ts',
      edits: [
        { oldText: 'x', newText: 'y' },
        { oldText: 'a', newText: 'b' },
      ],
    });
  });

  it('returns null for empty/invalid params', () => {
    expect(normalizeEditToolParams(null)).toBeNull();
    expect(normalizeEditToolParams({ path: 'x' })).toBeNull();
    expect(normalizeEditToolParams({ path: 'x', edits: [{ oldText: 1, newText: 'b' }] })).toBeNull();
  });
});
