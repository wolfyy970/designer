/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { RunTraceEvent } from '../../../../types/provider';
import { Timeline } from '../Timeline';

/**
 * DOM-order regression for the interleaving fix.
 *
 * A turn that called a tool and only *then* reasoned used to render its
 * "Thinking" accordion above the "Tool use" accordion regardless — the ordering
 * the viewer saw did not match the order events happened in. These assert the
 * rendered sequence, not just the pure helper, because the bug lived in the
 * render block.
 */

describe('Timeline turn ordering', () => {
  const turnTimes = new Set<string>();

  afterEach(() => {
    cleanup();
    turnTimes.clear();
  });

  const T = (sec: number) => new Date(Date.UTC(2026, 0, 1, 12, 0, sec)).toISOString();

  /**
   * `at` must be unique per turn: `buildTurnSegments` sorts every trace by time
   * before grouping, so two turn markers sharing a timestamp can swap order and
   * one turn then silently absorbs the other's traces — which reads as an
   * ordering bug in the component. Enforced here rather than documented.
   */
  function withTurn(turnId: number, at: string, inner: RunTraceEvent[]): RunTraceEvent[] {
    if (turnTimes.has(at)) {
      throw new Error(`withTurn: duplicate model_turn_start timestamp ${at} (turn ${turnId})`);
    }
    turnTimes.add(at);
    return [
      { id: `turn-${turnId}`, at, kind: 'model_turn_start', label: 'Turn', turnId },
      ...inner,
    ];
  }

  function precedes(first: HTMLElement, second: HTMLElement): boolean {
    return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  it('renders reasoning before the tools it precedes', () => {
    render(
      <Timeline
        trace={withTurn(1, T(0), [
          { id: 'a1', at: T(5), kind: 'tool_started', label: 'read_file' },
          { id: 'a2', at: T(6), kind: 'tool_finished', label: 'read_file' },
        ])}
        thinkingTurns={[{ turnId: 1, text: 'reading the files first', startedAt: Date.parse(T(1)) }]}
        isStreaming
      />,
    );

    const thinking = screen.getByRole('button', { name: /Thinking/i });
    const tools = screen.getByRole('button', { name: /Tool use/i });
    expect(precedes(thinking, tools)).toBe(true);
  });

  it('renders reasoning after tools that already ran', () => {
    render(
      <Timeline
        trace={withTurn(1, T(0), [
          { id: 'a1', at: T(5), kind: 'tool_started', label: 'read_file' },
          { id: 'a2', at: T(20), kind: 'tool_finished', label: 'read_file' },
        ])}
        thinkingTurns={[
          { turnId: 1, text: 'the file shows X, so I will now…', startedAt: Date.parse(T(30)) },
        ]}
        isStreaming
      />,
    );

    const thinking = screen.getByRole('button', { name: /Thinking/i });
    const tools = screen.getByRole('button', { name: /Tool use/i });
    expect(precedes(tools, thinking)).toBe(true);
  });

  it('orders each turn independently across multiple turns', () => {
    render(
      <Timeline
        trace={[
          ...withTurn(1, T(0), [
            { id: 'a1', at: T(5), kind: 'tool_started', label: 'read_file' },
            { id: 'a2', at: T(6), kind: 'tool_finished', label: 'read_file' },
          ]),
          ...withTurn(2, T(30), [
            { id: 'b1', at: T(40), kind: 'tool_started', label: 'write_file' },
            { id: 'b2', at: T(41), kind: 'tool_finished', label: 'write_file' },
          ]),
        ]}
        thinkingTurns={[
          { turnId: 1, text: 'first I read', startedAt: Date.parse(T(1)) },
          { turnId: 2, text: 'now I write', startedAt: Date.parse(T(35)) },
        ]}
        isStreaming
      />,
    );

    const buttons = screen.getAllByRole('button', { name: /Thinking|Tool use/i });
    expect(buttons.map((b) => (/Thinking/.test(b.textContent ?? '') ? 'thinking' : 'tools'))).toEqual([
      'thinking',
      'tools',
      'thinking',
      'tools',
    ]);
  });
});
