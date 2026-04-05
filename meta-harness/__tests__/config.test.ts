import { describe, it, expect } from 'vitest';
import {
  filterTestFilesBySubstrings,
  parseMetaHarnessArgv,
  parseMetaHarnessModeFromArgv,
  resolveMode,
} from '../config.ts';
import type { MetaHarnessConfig } from '../schemas.ts';

const baseCfg: MetaHarnessConfig = {
  apiBaseUrl: 'http://x/api',
  iterations: 2,
  proposerModel: 'm',
  proposerMaxToolRounds: 5,
  defaultCompilerProvider: 'p',
  mode: 'design',
};

describe('parseMetaHarnessModeFromArgv', () => {
  it('parses --mode=e2e', () => {
    expect(parseMetaHarnessModeFromArgv(['--mode=e2e'])).toBe('e2e');
  });
  it('parses --mode compile', () => {
    expect(parseMetaHarnessModeFromArgv(['--mode', 'compile'])).toBe('compile');
  });
  it('returns undefined when absent', () => {
    expect(parseMetaHarnessModeFromArgv(['--plain'])).toBeUndefined();
  });
});

describe('resolveMode', () => {
  it('CLI wins over config', () => {
    expect(resolveMode(['--mode=compile'], { ...baseCfg, mode: 'e2e' })).toBe('compile');
  });
  it('falls back to config.mode', () => {
    expect(resolveMode([], { ...baseCfg, mode: 'e2e' })).toBe('e2e');
  });
  it('defaults to design when neither set', () => {
    const { mode: _m, ...noMode } = baseCfg;
    expect(resolveMode([], noMode as MetaHarnessConfig)).toBe('design');
  });
});

describe('parseMetaHarnessArgv', () => {
  it('parses flags and test filters', () => {
    const a = parseMetaHarnessArgv(['--eval-only', '--plain', '--test=foo', '--test=bar'], baseCfg);
    expect(a.evalOnly).toBe(true);
    expect(a.plain).toBe(true);
    expect(a.testFilters).toEqual(['foo', 'bar']);
  });
});

describe('filterTestFilesBySubstrings', () => {
  it('returns all when no filters', () => {
    const files = ['/a/x.json', '/b/y.json'];
    expect(filterTestFilesBySubstrings(files, [])).toEqual(files);
  });
  it('OR-matches basename substrings case-insensitively', () => {
    const files = ['/t/FooBar.json', '/t/baz.json'];
    expect(filterTestFilesBySubstrings(files, ['foo'])).toEqual(['/t/FooBar.json']);
  });
});
