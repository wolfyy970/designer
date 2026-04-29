import { describe, expect, it, vi } from 'vitest';
import { AGENTIC_PHASE } from '../../constants/agentic-stream';
import { GENERATION_STATUS } from '../../constants/generation';
import { LOST_STREAM_CONNECTION_MESSAGE } from '../../api/client-sse-lifecycle';
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

  it('onActivity + onThinking + onStreamingTool all accumulate streamedModelChars', () => {
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

    cbs.onActivity?.('Hello ');                        // 6
    cbs.onActivity?.('world!');                        // 6
    cbs.onThinking?.(1, 'ABC');                        // 3
    cbs.onThinking?.(1, '');                           // ignored (empty)
    cbs.onThinking?.(2, 'DE');                         // 2
    cbs.onStreamingTool?.('write', 100, false, '/x');  // delta 100
    cbs.onStreamingTool?.('write', 250, false, '/x');  // delta 150
    cbs.onStreamingTool?.('write', 250, false, '/x');  // delta 0 (no change)

    expect(state.streamedModelChars).toBe(6 + 6 + 3 + 2 + 100 + 150);
  });

  it('onStreamingTool delta-tracks per tool (switching tools starts from zero)', () => {
    const state = createInitialPlaceholderSessionState();
    const cbs = createPlaceholderStreamCallbacks({
      placeholderId: 'ph-multi',
      traceLimit: 50,
      updateResult: vi.fn(),
      scheduleTraceServerForward: vi.fn(),
      state,
      raf: makeRaf(),
    });

    cbs.onStreamingTool?.('write', 400, false, '/a'); // +400
    cbs.onStreamingTool?.('write', 400, true, '/a');  // done — no increment
    cbs.onStreamingTool?.('read', 200, false, '/b');  // +200 (prev from other tool is ignored)

    expect(state.streamedModelChars).toBe(600);
  });

  it('onActivity closes any open thinking turn and sets streamMode to narrating', () => {
    const state = createInitialPlaceholderSessionState();
    const updateResult = vi.fn();
    const cbs = createPlaceholderStreamCallbacks({
      placeholderId: 'ph-close',
      traceLimit: 50,
      updateResult,
      scheduleTraceServerForward: vi.fn(),
      state,
      raf: makeRaf(),
    });

    cbs.onThinking?.(1, 'reasoning…');
    expect(state.thinkingTurns.find((t) => t.turnId === 1)?.endedAt).toBeUndefined();

    cbs.onActivity?.('visible text');
    expect(state.thinkingTurns.find((t) => t.turnId === 1)?.endedAt).toBeDefined();
    expect(updateResult).toHaveBeenCalledWith(
      'ph-close',
      expect.objectContaining({ streamMode: 'narrating' }),
    );
  });

  it('onStreamingTool closes any open thinking turn and sets streamMode to tool', () => {
    const state = createInitialPlaceholderSessionState();
    const updateResult = vi.fn();
    const cbs = createPlaceholderStreamCallbacks({
      placeholderId: 'ph-tool',
      traceLimit: 50,
      updateResult,
      scheduleTraceServerForward: vi.fn(),
      state,
      raf: makeRaf(),
    });

    cbs.onThinking?.(1, 'reasoning…');
    cbs.onStreamingTool?.('write', 50, false, '/x');
    expect(state.thinkingTurns.find((t) => t.turnId === 1)?.endedAt).toBeDefined();
    expect(updateResult).toHaveBeenCalledWith(
      'ph-tool',
      expect.objectContaining({ streamMode: 'tool' }),
    );
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

  it('onError surfaces lost connection as a generation error', () => {
    const state = createInitialPlaceholderSessionState();
    const updateResult = vi.fn();
    const cbs = createPlaceholderStreamCallbacks({
      placeholderId: 'ph-lost',
      traceLimit: 50,
      updateResult,
      scheduleTraceServerForward: vi.fn(),
      state,
      raf: makeRaf(),
    });
    cbs.onError?.(LOST_STREAM_CONNECTION_MESSAGE);
    expect(updateResult).toHaveBeenCalledWith(
      'ph-lost',
      expect.objectContaining({
        status: GENERATION_STATUS.ERROR,
        error: LOST_STREAM_CONNECTION_MESSAGE,
      }),
    );
  });
});
