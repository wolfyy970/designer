import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AggregatedEvaluationReport, EvaluationRoundSnapshot } from '../../../src/types/evaluation.ts';

const mkdirFn = vi.hoisted(() => vi.fn(async () => undefined));
const writeFileFn = vi.hoisted(() =>
  vi.fn(async (path: string, data: string | Buffer, enc?: BufferEncoding) => {
    void path;
    void data;
    void enc;
    return undefined;
  }),
);

vi.mock('node:fs/promises', () => ({
  mkdir: mkdirFn,
  writeFile: writeFileFn,
}));

vi.mock('../build-agentic-system-context.ts', () => ({
  buildAgenticSystemContext: vi.fn(async () => ({ skillCatalog: [] })),
}));

vi.mock('../prompt-resolution.ts', () => ({
  getPromptBody: vi.fn(async (key: string) => `stub-body:${key}`),
}));

import { writeAgenticEvalRunLog } from '../eval-run-logger.ts';

function minimalAggregate(overrides: Partial<AggregatedEvaluationReport> = {}): AggregatedEvaluationReport {
  return {
    overallScore: 0.8,
    normalizedScores: {},
    hardFails: [],
    prioritizedFixes: [],
    shouldRevise: false,
    revisionBrief: '',
    ...overrides,
  };
}

describe('writeAgenticEvalRunLog', () => {
  beforeEach(() => {
    mkdirFn.mockClear();
    writeFileFn.mockClear();
  });

  it('writes meta, compiled prompt, and prompt stubs under eval-runs/<runId>', async () => {
    const rounds: EvaluationRoundSnapshot[] = [
      {
        round: 1,
        files: { 'index.html': '<html></html>' },
        aggregate: minimalAggregate(),
      },
    ];
    const revisionPromptByEvalRound = new Map<number, string>();

    await writeAgenticEvalRunLog({
      baseDir: '/tmp/ad-eval-test',
      runId: 'run-abc',
      compiledPrompt: 'compiled text',
      evaluationContext: { strategyName: 'S1', hypothesis: 'hyp' },
      rounds,
      revisionPromptByEvalRound,
      stopReason: 'satisfied',
      finalAggregate: minimalAggregate({ overallScore: 0.9 }),
    });

    expect(mkdirFn).toHaveBeenCalled();

    const metaCall = writeFileFn.mock.calls.find((c) => String(c[0]).endsWith('meta.json'));
    expect(metaCall).toBeDefined();
    const meta = JSON.parse(metaCall![1] as string);
    expect(meta.runId).toBe('run-abc');
    expect(meta.stopReason).toBe('satisfied');
    expect(meta.finalOverallScore).toBe(0.9);
    expect(meta.strategyName).toBe('S1');

    const compiledCall = writeFileFn.mock.calls.find((c) => String(c[0]).endsWith('compiled-prompt.txt'));
    expect(compiledCall?.[1]).toBe('compiled text');

    const promptWrites = writeFileFn.mock.calls.filter((c) => String(c[0]).includes('/prompts/'));
    expect(promptWrites.length).toBeGreaterThanOrEqual(5);
    expect(promptWrites.some((c) => (c[1] as string).startsWith('stub-body:'))).toBe(true);

    const fileWrite = writeFileFn.mock.calls.find((c) => String(c[0]).includes('round-1/files/index.html'));
    expect(fileWrite?.[1]).toBe('<html></html>');
  });
});
