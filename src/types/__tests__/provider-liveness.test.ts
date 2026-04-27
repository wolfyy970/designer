import { describe, it, expect } from 'vitest';
import { GENERATION_STATUS } from '../../constants/generation';
import { pickLivenessSlice } from '../provider';
import type { GenerationResult } from '../provider';

function makeResult(patch: Partial<GenerationResult>): GenerationResult {
  return {
    id: 'r1',
    strategyId: 'vs',
    providerId: 'p',
    status: GENERATION_STATUS.GENERATING,
    runId: 'run',
    runNumber: 1,
    metadata: { model: 'm' },
    ...patch,
  };
}

describe('pickLivenessSlice', () => {
  it('forwards streamMode from the result', () => {
    const slice = pickLivenessSlice(makeResult({ streamMode: 'tool' }));
    expect(slice.streamMode).toBe('tool');
  });

  it('derives activeThinkingStartedAt from the most recent open thinking turn', () => {
    const slice = pickLivenessSlice(
      makeResult({
        thinkingTurns: [
          { turnId: 1, text: 'closed', startedAt: 100, endedAt: 200 },
          { turnId: 2, text: 'open', startedAt: 300 },
        ],
      }),
    );
    expect(slice.activeThinkingStartedAt).toBe(300);
  });

  it('leaves activeThinkingStartedAt undefined when every turn is closed', () => {
    const slice = pickLivenessSlice(
      makeResult({
        thinkingTurns: [{ turnId: 1, text: 'done', startedAt: 100, endedAt: 200 }],
      }),
    );
    expect(slice.activeThinkingStartedAt).toBeUndefined();
  });

  it('carries tool-streaming fields so the Timeline row can render pulse + tokens', () => {
    const slice = pickLivenessSlice(
      makeResult({
        streamingToolName: 'write',
        streamingToolPath: '/x.css',
        streamingToolChars: 420,
        streamMode: 'tool',
      }),
    );
    expect(slice.streamingToolName).toBe('write');
    expect(slice.streamingToolPath).toBe('/x.css');
    expect(slice.streamingToolChars).toBe(420);
    expect(slice.streamMode).toBe('tool');
  });
});
