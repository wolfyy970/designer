import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GENERATION_MODE } from '../../../src/constants/generation.ts';
import type { GenerateStreamBody } from '../../lib/generate-stream-schema.ts';

const mocks = vi.hoisted(() => ({
  runAgenticWithEvaluation: vi.fn(),
}));

vi.mock('../agentic-orchestrator.ts', () => ({
  runAgenticWithEvaluation: mocks.runAgenticWithEvaluation,
}));

import { createWriteGate, executeGenerateStreamSafe } from '../generate-execution.ts';

const baseBody: GenerateStreamBody = {
  prompt: 'x',
  providerId: 'openrouter',
  modelId: 'm',
  mode: GENERATION_MODE.AGENTIC,
};

describe('executeGenerateStreamSafe orchestrator wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runAgenticWithEvaluation.mockResolvedValue({
      files: { 'index.html': '<html></html>' },
      rounds: [],
      finalAggregate: {
        overallScore: 0,
        normalizedScores: {},
        hardFails: [],
        prioritizedFixes: [],
        shouldRevise: false,
        revisionBrief: '',
      },
      checkpoint: {
        totalRounds: 0,
        filesWritten: ['index.html'],
        finalTodosSummary: '',
        completedAt: new Date().toISOString(),
        stopReason: 'build_only',
        revisionAttempts: 0,
      },
      emittedFilePaths: ['index.html'],
    });
  });

  it('passes streamFailureController to runAgenticWithEvaluation for aligned SSE abort', async () => {
    let id = 0;
    const stream = {
      writeSSE: vi.fn(async () => {}),
    };
    await executeGenerateStreamSafe(stream as never, baseBody, new AbortController().signal, {
      allocId: () => String(id++),
      writeGate: createWriteGate(),
    });

    expect(mocks.runAgenticWithEvaluation).toHaveBeenCalledTimes(1);
    const opts = mocks.runAgenticWithEvaluation.mock.calls[0][0];
    expect(opts.streamFailureController).toBeInstanceOf(AbortController);
    const ctrl = opts.streamFailureController as AbortController;
    ctrl.abort();
    expect(ctrl.signal.aborted).toBe(true);
  });
});
