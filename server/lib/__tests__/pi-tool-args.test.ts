import { describe, it, expect } from 'vitest';
import { extractPiToolPathFromArguments, parsePiToolExecutionArgs } from '../pi-tool-args.ts';

describe('extractPiToolPathFromArguments', () => {
  it('returns first matching string path field', () => {
    expect(extractPiToolPathFromArguments({ path: 'a.css' })).toBe('a.css');
    expect(extractPiToolPathFromArguments({ file: 'b.ts' })).toBe('b.ts');
    expect(extractPiToolPathFromArguments({ filePath: 'c.js' })).toBe('c.js');
    expect(extractPiToolPathFromArguments({ target_file: 'd.md' })).toBe('d.md');
  });

  it('returns undefined for invalid shapes', () => {
    expect(extractPiToolPathFromArguments(null)).toBeUndefined();
    expect(extractPiToolPathFromArguments([])).toBeUndefined();
    expect(extractPiToolPathFromArguments({ path: '' })).toBeUndefined();
  });
});

describe('parsePiToolExecutionArgs', () => {
  it('extracts path and pattern from a record', () => {
    expect(parsePiToolExecutionArgs('read_file', { path: 'a.html' })).toEqual({ path: 'a.html' });
    expect(parsePiToolExecutionArgs('grep', { pattern: 'foo' })).toEqual({ pattern: 'foo' });
  });

  it('returns empty object for non-object args', () => {
    expect(parsePiToolExecutionArgs('ls', null)).toEqual({});
    expect(parsePiToolExecutionArgs('ls', 'x')).toEqual({});
    expect(parsePiToolExecutionArgs('ls', [])).toEqual({});
  });

  it('ignores non-string path/pattern', () => {
    expect(parsePiToolExecutionArgs('write_file', { path: 1, pattern: true })).toEqual({});
  });

  it('falls back to key when path is absent', () => {
    expect(parsePiToolExecutionArgs('load_skill', { key: 'design-quality' })).toEqual({
      path: 'design-quality',
    });
  });

  it('prefers path over key when both are present', () => {
    expect(parsePiToolExecutionArgs('any', { path: 'a.html', key: 'k' })).toEqual({
      path: 'a.html',
    });
  });

  it('falls back to name for use_skill progress labels', () => {
    expect(parsePiToolExecutionArgs('use_skill', { name: 'accessibility' })).toEqual({
      path: 'accessibility',
    });
  });
});
