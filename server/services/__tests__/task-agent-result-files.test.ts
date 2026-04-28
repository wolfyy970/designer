import { describe, expect, it } from 'vitest';
import { resolveTaskAgentResultFile } from '../task-agent-result-files.ts';

describe('resolveTaskAgentResultFile', () => {
  it('uses the expected result file when present', () => {
    expect(resolveTaskAgentResultFile({
      files: { 'result.json': '{"ok":true}', 'notes.txt': 'fallback' },
      resultFile: 'result.json',
      fallback: 'firstNonEmptyFile',
    })).toEqual({ result: '{"ok":true}', resultFile: 'result.json' });
  });

  it('falls back to the first non-empty file when allowed', () => {
    expect(resolveTaskAgentResultFile({
      files: { 'empty.txt': '   ', 'notes.txt': 'fallback' },
      resultFile: 'result.json',
      fallback: 'firstNonEmptyFile',
    })).toEqual({ result: 'fallback', resultFile: 'notes.txt' });
  });

  it('returns undefined for strict missing result files', () => {
    expect(resolveTaskAgentResultFile({
      files: { 'notes.txt': 'fallback' },
      resultFile: 'result.json',
      fallback: 'strict',
    })).toBeUndefined();
  });

  it('returns undefined when every file is empty', () => {
    expect(resolveTaskAgentResultFile({
      files: { 'notes.txt': '  ', 'other.txt': '' },
      resultFile: 'result.json',
      fallback: 'firstNonEmptyFile',
    })).toBeUndefined();
  });
});
