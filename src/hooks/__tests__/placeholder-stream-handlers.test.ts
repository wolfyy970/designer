import { describe, expect, it, vi } from 'vitest';
import { AGENTIC_PHASE } from '../../constants/agentic-stream';
import { GENERATION_STATUS } from '../../constants/generation';
import { createPlaceholderStreamCallbacks } from '../placeholder-stream-handlers';
import {
  createInitialPlaceholderSessionState,
  type PlaceholderRafBatchers,
} from '../placeholder-session-state';

function makeRaf(): PlaceholderRafBatchers {
  const noop = () => ({ schedule: vi.fn(), cancelOnly: vi.fn() });
  return {
    activity: noop(),
    thinking: noop(),
    streamingTool: noop(),
    code: noop(),
  };
}

describe('createPlaceholderStreamCallbacks', () => {
  it('onPhase maps building/evaluating/revising/complete to progress and trace rows', () => {
    const state = createInitialPlaceholderSessionState();
    const updateResult = vi.fn();
    const scheduleTraceServerForward = vi.fn();
    const cbs = createPlaceholderStreamCallbacks({
      placeholderId: 'ph-test',
      traceLimit: 50,
      updateResult,
      scheduleTraceServerForward,
      state,
      raf: makeRaf(),
    });

    cbs.onPhase?.(AGENTIC_PHASE.EVALUATING);
    expect(updateResult).toHaveBeenCalledWith(
      'ph-test',
      expect.objectContaining({
        agenticPhase: AGENTIC_PHASE.EVALUATING,
        progressMessage: 'Running evaluators…',
      }),
    );
  });

  it('onActivity + onThinking accumulate streamedModelChars on session state', () => {
    const state = createInitialPlaceholderSessionState();
    const updateResult = vi.fn();
    const cbs = createPlaceholderStreamCallbacks({
      placeholderId: 'ph-tok',
      traceLimit: 50,
      updateResult,
      scheduleTraceServerForward: vi.fn(),
      state,
      raf: makeRaf(),
    });

    cbs.onActivity?.('Hello ');   // 6
    cbs.onActivity?.('world!');   // 6
    cbs.onThinking?.(1, 'ABC');   // 3
    cbs.onThinking?.(1, '');      // ignored (empty)
    cbs.onThinking?.(2, 'DE');    // 2
    cbs.onStreamingTool?.('write', 9999, false, '/x'); // tool args → NOT counted

    expect(state.streamedModelChars).toBe(17);
  });

  it('onError marks generation error on the result', () => {
    const state = createInitialPlaceholderSessionState();
    const updateResult = vi.fn();
    const cbs = createPlaceholderStreamCallbacks({
      placeholderId: 'ph-err',
      traceLimit: 50,
      updateResult,
      scheduleTraceServerForward: vi.fn(),
      state,
      raf: makeRaf(),
    });
    cbs.onError?.('boom');
    expect(updateResult).toHaveBeenCalledWith(
      'ph-err',
      expect.objectContaining({ status: GENERATION_STATUS.ERROR, error: 'boom' }),
    );
  });
});
