import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GENERATION_MODE } from '../../../src/constants/generation.ts';
import type { GenerateStreamBody } from '../../lib/generate-stream-schema.ts';

vi.mock('../agentic-orchestrator.ts', () => ({
  runAgenticWithEvaluation: vi.fn(() => Promise.reject(new Error('forced orchestrator failure'))),
}));

import { createWriteGate } from '../../lib/sse-write-gate.ts';
import { executeGenerateStreamSafe } from '../generate-execution.ts';

const baseBody: GenerateStreamBody = {
  prompt: 'x',
  providerId: 'openrouter',
  modelId: 'm',
  mode: GENERATION_MODE.AGENTIC,
};

describe('executeGenerateStreamSafe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves when the error-tail writeSSE fails (e.g. client disconnected)', async () => {
    let id = 0;
    const stream = {
      writeSSE: vi.fn(async () => {
        throw new Error('broken pipe');
      }),
    };
    await expect(
      executeGenerateStreamSafe(stream as never, baseBody, new AbortController().signal, {
        allocId: () => String(id++),
        writeGate: createWriteGate(),
      }),
    ).resolves.toBeUndefined();
    expect(stream.writeSSE).toHaveBeenCalled();
  });
});
