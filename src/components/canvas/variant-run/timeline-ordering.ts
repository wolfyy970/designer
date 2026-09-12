/**
 * Chronological ordering for one timeline model turn.
 *
 * A turn's pieces used to render in a fixed order — every thinking slice first
 * (hoisted above everything), then every tool block, then the remaining trace
 * lines, then the answer text. That produced the "think, act, then think again
 * *above* the action" jumpiness in watch mode: the story on screen did not match
 * the order the events actually happened in.
 *
 * This module flattens a turn into a single time-ordered list instead, so the
 * DOM order matches occurrence order.
 *
 * Data-shape caveat: one turn carries **one coalesced thinking slice**
 * (`ThinkingTurnSlice`), not one per reasoning phase — `onThinking` merges every
 * delta for a `turnId` into a single entry keyed by its first delta's
 * timestamp. So a turn's reasoning can only be anchored once, at its start. The
 * anchor is deliberately the *start*, so the familiar "reason first, then call
 * tools" reading is preserved; genuinely separate reasoning phases would need
 * per-phase slices upstream (a hook change, not a render change).
 */

import type { RunTraceEvent } from '../../../lib/run-trace-event-schema';
import type { ThinkingTurnSlice } from '../../../types/provider';

const TOOL_USE_KINDS: ReadonlySet<RunTraceEvent['kind']> = new Set([
  'tool_started',
  'tool_finished',
  'tool_failed',
]);

/** A contiguous run of tool traces (one collapsible "Tool calls" block). */
export interface TimelineToolGroup {
  kind: 'toolUse';
  traces: RunTraceEvent[];
}

export type TimelinePart =
  | { kind: 'thinking'; slice: ThinkingTurnSlice }
  | TimelineToolGroup
  | { kind: 'trace'; trace: RunTraceEvent };

function atMs(at: string | undefined): number {
  if (at == null) return Number.NaN;
  return Date.parse(at);
}

/**
 * Sort weight for a part. Stable `Array.prototype.sort` keeps the original
 * relative order for equal weights, so a part with an unparseable timestamp
 * stays where the caller put it rather than jumping to the front.
 */
function weightOf(part: TimelinePart): number {
  switch (part.kind) {
    case 'thinking':
      return Number.isFinite(part.slice.startedAt) ? part.slice.startedAt : Number.NaN;
    case 'toolUse': {
      const ms = atMs(part.traces[0]?.at);
      return Number.isFinite(ms) ? ms : Number.NaN;
    }
    case 'trace': {
      const ms = atMs(part.trace.at);
      return Number.isFinite(ms) ? ms : Number.NaN;
    }
  }
}

export function buildTurnTimelineParts(input: {
  traces: readonly RunTraceEvent[];
  slice?: ThinkingTurnSlice;
  /**
   * True when this turn has a tool streaming whose `tool_started` trace has not
   * arrived yet. The "Tool use" row must still render then — it is what shows the
   * live tool name during the first call of a turn.
   */
  streamingToolPending?: boolean;
}): TimelinePart[] {
  const parts: TimelinePart[] = [];

  if (input.slice != null && input.slice.text.trim().length > 0) {
    parts.push({ kind: 'thinking', slice: input.slice });
  }

  let pendingTools: RunTraceEvent[] = [];
  const flushTools = () => {
    if (pendingTools.length === 0) return;
    parts.push({ kind: 'toolUse', traces: pendingTools });
    pendingTools = [];
  };

  for (const trace of input.traces) {
    if (TOOL_USE_KINDS.has(trace.kind)) {
      pendingTools.push(trace);
      continue;
    }
    flushTools();
    parts.push({ kind: 'trace', trace });
  }
  flushTools();

  // Anchored at the end: the streaming call is the newest thing happening. A
  // trace-less group is only ever this placeholder, so it never disturbs
  // real-time ordering above.
  if (input.streamingToolPending === true) {
    parts.push({ kind: 'toolUse', traces: [] });
  }

  return parts.sort((a, b) => {
    const wa = weightOf(a);
    const wb = weightOf(b);
    if (!Number.isFinite(wa) && !Number.isFinite(wb)) return 0;
    if (!Number.isFinite(wa)) return 1;
    if (!Number.isFinite(wb)) return -1;
    return wa - wb;
  });
}
