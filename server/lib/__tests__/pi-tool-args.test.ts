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
