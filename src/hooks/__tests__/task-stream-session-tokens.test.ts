/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { createTaskStreamSession } from '../task-stream-session';
import type { TaskStreamState } from '../task-stream-state';

/**
 * `streamedModelChars` is the data behind the `~N tok` live counter in
 * `TaskStreamMonitor`. Accumulates answer, thinking, AND tool-arg deltas
 * so the counter keeps ticking through every phase of a run.
 *
 * The RAF-batched patches flush inside `finalize()`, so each test ends
 * with finalize and asserts against the last patch received.
 */
function lastPatchWithField<K extends keyof TaskStreamState>(
  onPatch: ReturnType<typeof vi.fn>,
  key: K,
): TaskStreamState[K] | undefined {
  for (let i = onPatch.mock.calls.length - 1; i >= 0; i--) {
    const patch = onPatch.mock.calls[i][0] as Partial<TaskStreamState>;
    if (key in patch) return patch[key];
  }
  return undefined;
}

describe('task-stream-session streamedModelChars accumulation', () => {
  it('accumulates answer-stream (onActivity) deltas and patches via RAF flush', async () => {
    const onPatch = vi.fn();
    const { callbacks, finalize } = createTaskStreamSession({
      sessionId: 'sess-test-1',
      onPatch,
    });

    callbacks.onActivity?.('Hello ');
    callbacks.onActivity?.('world!');
    await finalize();

    expect(lastPatchWithField(onPatch, 'streamedModelChars')).toBe(12);
  });

  it('accumulates thinking (onThinking) deltas across turns', async () => {
    const onPatch = vi.fn();
    const { callbacks, finalize } = createTaskStreamSession({
      sessionId: 'sess-test-2',
      onPatch,
    });

    callbacks.onThinking?.(1, 'Reasoning …');
    callbacks.onThinking?.(1, ' more');
    callbacks.onThinking?.(2, 'next turn');
    await finalize();

    // 'Reasoning …' (11) + ' more' (5) + 'next turn' (9) = 25
    expect(lastPatchWithField(onPatch, 'streamedModelChars')).toBe(25);
  });

  it('sums answer + thinking into a single counter', async () => {
    const onPatch = vi.fn();
    const { callbacks, finalize } = createTaskStreamSession({
      sessionId: 'sess-test-3',
      onPatch,
    });

    callbacks.onActivity?.('ABCDE'); // 5
    callbacks.onThinking?.(1, 'FG'); // 2
    callbacks.onActivity?.('HIJ'); //   3
    await finalize();

    expect(lastPatchWithField(onPatch, 'streamedModelChars')).toBe(10);
  });

  it('counts tool-arg streaming (onStreamingTool) as delta-based tokens', async () => {
    const onPatch = vi.fn();
    const { callbacks, finalize } = createTaskStreamSession({
      sessionId: 'sess-test-4',
      onPatch,
    });

    callbacks.onStreamingTool?.('write', 500, false, '/tmp/x');   // +500
    callbacks.onStreamingTool?.('write', 1200, false, '/tmp/x');  // +700
    callbacks.onStreamingTool?.('write', 1200, true, '/tmp/x');   // done: no increment
    await finalize();

    expect(lastPatchWithField(onPatch, 'streamedModelChars')).toBe(1200);
  });

  it('delta-tracks per tool name (switching tools does not re-count the previous tool)', async () => {
    const onPatch = vi.fn();
    const { callbacks, finalize } = createTaskStreamSession({
      sessionId: 'sess-test-multi-tool',
      onPatch,
    });

    callbacks.onStreamingTool?.('write', 800, false, '/a'); // +800
    callbacks.onStreamingTool?.('write', 800, true, '/a');  // done
    callbacks.onStreamingTool?.('read', 100, false, '/b');  // +100 (fresh tool; prev=0)
    await finalize();

    expect(lastPatchWithField(onPatch, 'streamedModelChars')).toBe(900);
  });

  it('never patches a negative or NaN token count', async () => {
    const onPatch = vi.fn();
    const { callbacks, finalize } = createTaskStreamSession({
      sessionId: 'sess-test-5',
      onPatch,
    });

    callbacks.onActivity?.('');
    callbacks.onThinking?.(1, '');
    await finalize();

    const val = lastPatchWithField(onPatch, 'streamedModelChars');
    // empty onThinking bails before accumulation; empty onActivity contributes 0
    expect(val == null || val === 0).toBe(true);
  });
});
