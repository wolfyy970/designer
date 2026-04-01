import { describe, it, expect } from 'vitest';
import { parsePiToolExecutionArgs } from '../pi-tool-args.ts';

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
});
