import { describe, expect, it } from 'vitest';
import { filterNoisePrioritizedFixes, tryPrettyJson } from '../eval-prioritized-fix-utils';

describe('filterNoisePrioritizedFixes', () => {
  it('drops noisy hard-fail prefixes', () => {
    const fixes = [
      '[hard_fail:js_runtime] boom',
      '[hard_fail:evaluator_worker_error] {"x":1}',
      '[hard_fail:missing_assets] skip',
    ];
    expect(filterNoisePrioritizedFixes(fixes)).toEqual([
      '[hard_fail:evaluator_worker_error] {"x":1}',
    ]);
  });
});

describe('tryPrettyJson', () => {
  it('pretty-prints whole JSON', () => {
    expect(tryPrettyJson('{"a":1}')).toEqual({ json: '{\n  "a": 1\n}' });
  });

  it('extracts label before JSON object', () => {
    const r = tryPrettyJson('Evaluator worker failed: {"issues":[]}');
    expect(r?.label).toBe('Evaluator worker failed');
    expect(r?.json).toBe('{\n  "issues": []\n}');
  });
});
