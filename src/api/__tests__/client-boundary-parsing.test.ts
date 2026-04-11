import { describe, expect, it } from 'vitest';
import { normalizeIncubateOptions, parseHypothesisSseJson } from '../client';

describe('parseHypothesisSseJson', () => {
  it('returns plain objects only', () => {
    expect(parseHypothesisSseJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseHypothesisSseJson('[1]')).toBeNull();
    expect(parseHypothesisSseJson('"x"')).toBeNull();
    expect(parseHypothesisSseJson('null')).toBeNull();
  });
});

describe('normalizeIncubateOptions', () => {
  it('treats object with agentic key as split options', () => {
    const agentic = { onDone: () => {} };
    expect(normalizeIncubateOptions({ agentic })).toEqual({ agentic });
  });

  it('wraps legacy incubate-only callbacks', () => {
    const incubate = { onDone: () => {} };
    expect(normalizeIncubateOptions(incubate)).toEqual({ incubate });
  });
});
