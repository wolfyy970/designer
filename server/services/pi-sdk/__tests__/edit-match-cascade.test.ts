import { describe, expect, it } from 'vitest';
import {
  attemptMatchCascade,
  isEditNotFoundError,
  normalizeEditToolParams,
  strategy1LeadingWhitespaceOnly,
  strategy2CollapsedWhitespace,
  strategy3LineTrimAnchors,
} from '../edit-match-cascade.ts';

describe('edit-match-cascade', () => {
  describe('strategy1LeadingWhitespaceOnly', () => {
    it('maps wrong indent to exact file slice (unique)', () => {
      const file = 'function f() {\n    return 1;\n}';
      const wrong = 'function f() {\n  return 1;\n}';
      const got = strategy1LeadingWhitespaceOnly(file, wrong);
      expect(got).toBe('function f() {\n    return 1;\n}');
    });

    it('returns null when pattern matches multiple windows', () => {
      const file = '  a\n  a\n  a';
      const wrong = 'a';
      expect(strategy1LeadingWhitespaceOnly(file, wrong)).toBeNull();
    });

    it('returns null when no match', () => {
      expect(strategy1LeadingWhitespaceOnly('foo', 'bar')).toBeNull();
    });
  });

  describe('strategy2CollapsedWhitespace', () => {
    it('matches when model omits blank lines', () => {
      const file = 'const x = 1;\n\nconst y = 2;';
      const wrong = 'const x = 1; const y = 2;';
      const got = strategy2CollapsedWhitespace(file, wrong);
      expect(got).toBe('const x = 1;\n\nconst y = 2;');
    });

    it('returns null when collapsed form is ambiguous', () => {
      const file = 'a b\n\nc d\n\na b';
      const wrong = 'a b c d';
      expect(strategy2CollapsedWhitespace(file, wrong)).toBeNull();
    });
  });

  describe('strategy3LineTrimAnchors', () => {
    it('matches when trailing spaces on lines differ', () => {
      const file = 'line1  \n  line2\t';
      const wrong = 'line1\nline2';
      const got = strategy3LineTrimAnchors(file, wrong);
      expect(got).toBe('line1  \n  line2\t');
    });

    it('returns null for duplicate trimmed blocks same length', () => {
      const file = 'A\nB\nA\nB';
      const wrong = 'A\nB';
      expect(strategy3LineTrimAnchors(file, wrong)).toBeNull();
    });
  });

  describe('attemptMatchCascade', () => {
    it('corrects when brace block uses wrong indent depth', () => {
      const file = 'function f() {\n    return 1;\n}';
      const got = attemptMatchCascade(file, [
        { oldText: 'function f() {\n  return 1;\n}', newText: 'function f() {\n    return 2;\n}' },
      ]);
      expect(got).not.toBeNull();
      expect(got![0].oldText).toBe('function f() {\n    return 1;\n}');
      expect(got![0].newText).toBe('function f() {\n    return 2;\n}');
    });

    it('returns null when nothing matches', () => {
      expect(attemptMatchCascade('aaa', [{ oldText: 'zzz', newText: 'b' }])).toBeNull();
    });

    it('returns null when literal substring is not fixable by strategies', () => {
      expect(attemptMatchCascade('hello world', [{ oldText: 'world', newText: 'moon' }])).toBeNull();
    });
  });

  describe('normalizeEditToolParams', () => {
    it('folds top-level oldText newText into edits', () => {
      const got = normalizeEditToolParams({
        path: 'x.ts',
        oldText: 'a',
        newText: 'b',
      });
      expect(got).toEqual({ path: 'x.ts', edits: [{ oldText: 'a', newText: 'b' }] });
    });

    it('appends to existing edits', () => {
      const got = normalizeEditToolParams({
        path: 'x.ts',
        edits: [{ oldText: '1', newText: '2' }],
        oldText: 'a',
        newText: 'b',
      });
      expect(got?.edits).toEqual([
        { oldText: '1', newText: '2' },
        { oldText: 'a', newText: 'b' },
      ]);
    });

    it('returns null for empty edits', () => {
      expect(normalizeEditToolParams({ path: 'x' })).toBeNull();
    });
  });

  describe('isEditNotFoundError', () => {
    it('detects Pi not-found message', () => {
      expect(
        isEditNotFoundError(
          'Could not find the exact text in app.ts. The old text must match exactly including all whitespace and newlines.',
        ),
      ).toBe(true);
      expect(isEditNotFoundError('Could not find edits[0] in app.ts.')).toBe(true);
    });

    it('rejects duplicate-match message', () => {
      expect(isEditNotFoundError('Found 2 occurrences of the text in app.ts.')).toBe(false);
    });
  });
});
