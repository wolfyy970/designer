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
  defaultIncubatorProvider: 'p',
  mode: 'design',
};

describe('parseMetaHarnessModeFromArgv', () => {
  it('parses --mode=e2e', () => {
    expect(parseMetaHarnessModeFromArgv(['--mode=e2e'])).toBe('e2e');
  });
  it('parses --mode incubate', () => {
    expect(parseMetaHarnessModeFromArgv(['--mode', 'incubate'])).toBe('incubate');
  });
  it('parses --mode=inputs', () => {
    expect(parseMetaHarnessModeFromArgv(['--mode=inputs'])).toBe('inputs');
  });
  it('parses --mode inputs (space-separated)', () => {
    expect(parseMetaHarnessModeFromArgv(['--mode', 'inputs'])).toBe('inputs');
  });
  it('returns undefined when absent', () => {
    expect(parseMetaHarnessModeFromArgv(['--plain'])).toBeUndefined();
  });
  it('throws on unknown mode', () => {
    expect(() => parseMetaHarnessModeFromArgv(['--mode=bogus'])).toThrow(/Invalid --mode/);
  });
});

describe('resolveMode', () => {
  it('CLI wins over config', () => {
    expect(resolveMode(['--mode=incubate'], { ...baseCfg, mode: 'e2e' })).toBe('incubate');
  });
  it('falls back to config.mode', () => {
    expect(resolveMode([], { ...baseCfg, mode: 'e2e' })).toBe('e2e');
  });
  it('defaults to design when neither set', () => {
    const noMode = { ...baseCfg };
    delete noMode.mode;
    expect(resolveMode([], noMode)).toBe('design');
  });
});

describe('parseMetaHarnessArgv', () => {
  it('parses flags and test filters', () => {
    const a = parseMetaHarnessArgv(['--eval-only', '--plain', '--test=foo', '--test=bar'], baseCfg);
    expect(a.evalOnly).toBe(true);
    expect(a.plain).toBe(true);
    expect(a.skipPromotionCheck).toBe(false);
    expect(a.testFilters).toEqual(['foo', 'bar']);
  });

  it('parses --skip-promotion-check', () => {
    const a = parseMetaHarnessArgv(['--skip-promotion-check'], baseCfg);
    expect(a.skipPromotionCheck).toBe(true);
    expect(a.promoteOnly).toBe(false);
  });

  it('parses --improve as skip preflight', () => {
    const a = parseMetaHarnessArgv(['--improve'], baseCfg);
    expect(a.skipPromotionCheck).toBe(true);
    expect(a.promoteOnly).toBe(false);
  });

  it('parses --promote', () => {
    const a = parseMetaHarnessArgv(['--promote'], baseCfg);
    expect(a.promoteOnly).toBe(true);
    expect(a.skipPromotionCheck).toBe(false);
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
