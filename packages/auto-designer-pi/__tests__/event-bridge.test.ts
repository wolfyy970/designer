import { describe, it, expect, vi, afterEach } from 'vitest';

import { subscribeNarrowBridge, type SessionEvent } from '../src/event-bridge.ts';
import type { AgentSession, AgentSessionEvent } from '../src/internal/pi-types.ts';

/**
 * `subscribeNarrowBridge` is the package's only producer of run-termination
 * state: `host.ts`'s `run()` reads `agent_end` to fill `SessionRunResult.
 * aborted` / `.errorMessage`. A regression in the message scan below would
 * make a failed run report as a clean success, so it is pinned here.
 *
 * The bridge is pure event reshaping — no Pi session is constructed.
 */

type Emit = (event: AgentSessionEvent) => void;

/** Minimal fake exposing only the `subscribe` surface the bridge touches. */
function fakeSession(): { session: AgentSession; emit: Emit } {
  let handler: Emit = () => {};
  const session = {
    subscribe: (fn: Emit) => {
      handler = fn;
      return () => {
        handler = () => {};
      };
    },
  } as unknown as AgentSession;
  return { session, emit: (event) => handler(event) };
}

/** Collect every narrow event the bridge forwards. */
function collect(): { events: SessionEvent[]; onEvent: (e: SessionEvent) => void } {
  const events: SessionEvent[] = [];
  return { events, onEvent: (e) => void events.push(e) };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('subscribeNarrowBridge', () => {
  it('forwards only the narrow vocabulary and drops every other Pi event', () => {
    const { session, emit } = fakeSession();
    const { events, onEvent } = collect();
    subscribeNarrowBridge(session, { onEvent });

    // Pi events the host layer owns — must NOT reach the package bridge.
    const ignored = [
      'message_start',
      'message_update',
      'message_end',
      'tool_execution_update',
      'auto_compaction_start',
      'something_added_by_a_future_pi_version',
    ];
    for (const type of ignored) emit({ type } as AgentSessionEvent);

    expect(events).toEqual([]);
  });

  it('measures tool duration from the matching start event', () => {
    vi.useFakeTimers();
    const { session, emit } = fakeSession();
    const { events, onEvent } = collect();
    subscribeNarrowBridge(session, { onEvent });

    emit({ type: 'tool_execution_start', toolCallId: 'a', toolName: 'read' } as AgentSessionEvent);
    vi.advanceTimersByTime(250);
    emit({ type: 'tool_execution_end', toolCallId: 'a', toolName: 'read' } as AgentSessionEvent);

    expect(events).toEqual([
      { type: 'tool_execution_start', toolCallId: 'a', toolName: 'read' },
      { type: 'tool_execution_end', toolCallId: 'a', toolName: 'read', durationMs: 250 },
    ]);
  });

  it('reports 0ms when a tool end has no matching start (and does not throw)', () => {
    const { session, emit } = fakeSession();
    const { events, onEvent } = collect();
    subscribeNarrowBridge(session, { onEvent });

    emit({ type: 'tool_execution_end', toolCallId: 'orphan', toolName: 'bash' } as AgentSessionEvent);

    expect(events).toEqual([
      { type: 'tool_execution_end', toolCallId: 'orphan', toolName: 'bash', durationMs: 0 },
    ]);
  });

  it('maps agent_end stop reasons onto aborted / errorMessage', () => {
    const cases: Array<{
      label: string;
      messages: unknown;
      expected: { aborted: boolean; errorMessage?: string };
    }> = [
      {
        label: 'stopReason error surfaces the message',
        messages: [{ role: 'user' }, { role: 'assistant', stopReason: 'error', errorMessage: 'upstream 500' }],
        expected: { aborted: false, errorMessage: 'upstream 500' },
      },
      {
        label: 'stopReason aborted sets aborted',
        messages: [{ role: 'assistant', stopReason: 'aborted' }],
        expected: { aborted: true },
      },
      {
        label: 'a clean stop is neither aborted nor an error',
        messages: [{ role: 'assistant', stopReason: 'stop' }],
        expected: { aborted: false },
      },
      {
        label: 'no assistant message at all is a clean run, not a crash',
        messages: [{ role: 'user' }],
        expected: { aborted: false },
      },
      {
        label: 'non-array messages are tolerated',
        messages: undefined,
        expected: { aborted: false },
      },
    ];

    for (const { label, messages, expected } of cases) {
      const { session, emit } = fakeSession();
      const { events, onEvent } = collect();
      subscribeNarrowBridge(session, { onEvent });

      emit({ type: 'agent_end', messages } as AgentSessionEvent);

      expect(events, label).toEqual([{ type: 'agent_end', ...expected }]);
    }
  });

  it('finds the last assistant message rather than assuming the final message is one', () => {
    const { session, emit } = fakeSession();
    const { events, onEvent } = collect();
    subscribeNarrowBridge(session, { onEvent });

    // Pi appends a tool-result message after the assistant turn that errored.
    emit({
      type: 'agent_end',
      messages: [
        { role: 'assistant', stopReason: 'error', errorMessage: 'rate limited' },
        { role: 'toolResult' },
      ],
    } as AgentSessionEvent);

    expect(events).toEqual([
      { type: 'agent_end', aborted: false, errorMessage: 'rate limited' },
    ]);
  });

  it('passes compaction lifecycle through, including summary length', () => {
    const { session, emit } = fakeSession();
    const { events, onEvent } = collect();
    subscribeNarrowBridge(session, { onEvent });

    emit({ type: 'compaction_start', reason: 'threshold' } as AgentSessionEvent);
    emit({
      type: 'compaction_end',
      reason: 'threshold',
      aborted: false,
      willRetry: true,
      errorMessage: undefined,
      result: { summary: 'x'.repeat(42) },
    } as AgentSessionEvent);

    expect(events).toEqual([
      { type: 'compaction_start', reason: 'threshold' },
      {
        type: 'compaction_end',
        reason: 'threshold',
        aborted: false,
        willRetry: true,
        errorMessage: undefined,
        summaryChars: 42,
      },
    ]);
  });

  it('returns the unsubscribe function so a completed run stops emitting', () => {
    const { session, emit } = fakeSession();
    const { events, onEvent } = collect();

    const unsubscribe = subscribeNarrowBridge(session, { onEvent });
    emit({ type: 'turn_start' } as AgentSessionEvent);
    expect(events).toHaveLength(1);

    unsubscribe();
    emit({ type: 'turn_start' } as AgentSessionEvent);
    expect(events).toHaveLength(1);
  });
});
