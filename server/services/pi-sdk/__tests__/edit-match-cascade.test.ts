import { describe, expect, it } from 'vitest';
import {
  attemptMatchCascade,
  isEditNotFoundError,
  normalizeEditToolParams,
  strategy1LeadingWhitespaceOnly,
  strategy2CollapsedWhitespace,
  strategy3LineTrimAnchors,
  strategy4CaseInsensitiveCollapsed,
  strategy5AnchorLines,
  type CascadeDiagnostic,
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

  describe('strategy4CaseInsensitiveCollapsed', () => {
    it('matches when model changes case of HTML attribute values', () => {
      const file = '<div class="Review-Summary">\n  <h2>Summary</h2>\n</div>';
      const wrong = '<div class="review-summary">\n  <h2>Summary</h2>\n</div>';
      const got = strategy4CaseInsensitiveCollapsed(file, wrong);
      expect(got).toBe(file);
    });

    it('matches when model adds extra spaces inside tags', () => {
      const file = '<button class="btn primary">\n  Submit\n</button>';
      const wrong = '<button  class="btn  primary">\n  Submit\n</button>';
      const got = strategy4CaseInsensitiveCollapsed(file, wrong);
      expect(got).toBe(file);
    });

    it('returns null for ambiguous case-insensitive matches', () => {
      const file = '<div>A</div>\n<div>a</div>';
      const wrong = '<DIV>A</DIV>';
      expect(strategy4CaseInsensitiveCollapsed(file, wrong)).toBeNull();
    });

    it('returns null when no match exists even case-insensitively', () => {
      expect(strategy4CaseInsensitiveCollapsed('foo bar', 'baz qux')).toBeNull();
    });
  });

  describe('strategy5AnchorLines', () => {
    it('matches when interior lines differ slightly', () => {
      const file = '<section id="hero">\n  <h1>Welcome Home</h1>\n  <p>Subtitle here</p>\n</section>';
      const wrong = '<section id="hero">\n  <h1>Welcome home</h1>\n  <p>subtitle here</p>\n</section>';
      const got = strategy5AnchorLines(file, wrong);
      expect(got).toBe(file);
    });

    it('matches when file has extra blank lines inside the block', () => {
      const file = '<header>\n\n  <nav>links</nav>\n\n  <h1>Title</h1>\n\n</header>';
      const wrong = '<header>\n  <nav>links</nav>\n  <h1>Title</h1>\n</header>';
      const got = strategy5AnchorLines(file, wrong);
      expect(got).toBe(file);
    });

    it('returns null for blocks shorter than 3 lines', () => {
      expect(strategy5AnchorLines('a\nb', 'a\nb')).toBeNull();
    });

    it('returns null when anchors are ambiguous', () => {
      const file = '<div>\n  <p>A</p>\n</div>\n<div>\n  <p>B</p>\n</div>';
      const wrong = '<div>\n  <p>X</p>\n</div>';
      expect(strategy5AnchorLines(file, wrong)).toBeNull();
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

    it('resolves via strategy4 when case differs', () => {
      const file = '<div class="Review">\n  content\n</div>';
      const got = attemptMatchCascade(file, [
        { oldText: '<div class="review">\n  content\n</div>', newText: '<div class="updated">\n  content\n</div>' },
      ]);
      expect(got).not.toBeNull();
      expect(got![0].oldText).toBe(file);
    });

    it('resolves via strategy5 when interior lines differ', () => {
      const file = '<section>\n  <h1>Welcome Home</h1>\n  <p>Subtitle</p>\n</section>';
      const got = attemptMatchCascade(file, [
        { oldText: '<section>\n  <h1>Welcome home</h1>\n  <p>subtitle</p>\n</section>', newText: '<section>\n  <h1>New</h1>\n</section>' },
      ]);
      expect(got).not.toBeNull();
      expect(got![0].oldText).toBe(file);
    });

    it('populates diagnostics array when provided', () => {
      const diag: CascadeDiagnostic[] = [];
      attemptMatchCascade('aaa', [{ oldText: 'zzz', newText: 'b' }], diag);
      expect(diag).toHaveLength(1);
      expect(diag[0].resolvedBy).toBeNull();
      expect(diag[0].strategiesAttempted.length).toBeGreaterThan(0);
    });

    it('diagnostics record which strategy resolved the edit', () => {
      const file = 'function f() {\n    return 1;\n}';
      const diag: CascadeDiagnostic[] = [];
      attemptMatchCascade(
        file,
        [{ oldText: 'function f() {\n  return 1;\n}', newText: 'function f() {\n    return 2;\n}' }],
        diag,
      );
      expect(diag).toHaveLength(1);
      expect(diag[0].resolvedBy).toBe('strategy1LeadingWhitespaceOnly');
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
