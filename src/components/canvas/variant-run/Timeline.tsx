import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Brain,
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  Wrench,
} from 'lucide-react';
import type { RunTraceEvent, ThinkingTurnSlice } from '../../../types/provider';
import { StreamdownTimeline } from './StreamdownTimeline.tsx';

const NEAR_BOTTOM_PX = 48;

const STATUS_COLOR: Record<string, string> = {
  error: 'text-error',
  warning: 'text-amber-500',
  success: 'text-accent',
};

/** Per-turn trace lines grouped under the Tool use accordion (matches bridge + UX). */
const TOOL_USE_KINDS = new Set<RunTraceEvent['kind']>([
  'model_first_token',
  'tool_started',
  'tool_finished',
  'tool_failed',
  'file_written',
]);

function partitionToolUseTraces(traces: RunTraceEvent[]): {
  toolUse: RunTraceEvent[];
  rest: RunTraceEvent[];
} {
  const toolUse: RunTraceEvent[] = [];
  const rest: RunTraceEvent[] = [];
  for (const t of traces) {
    if (TOOL_USE_KINDS.has(t.kind)) toolUse.push(t);
    else rest.push(t);
  }
  return { toolUse, rest };
}

function traceTimeLabel(at: string): string {
  const ms = Date.parse(at);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export interface TurnTimelineSegment {
  turnId: number;
  startTrace: RunTraceEvent;
  traces: RunTraceEvent[];
}

function buildTurnSegments(traces: RunTraceEvent[]): {
  preamble: RunTraceEvent[];
  segments: TurnTimelineSegment[];
} {
  const sorted = [...traces].sort(
    (a, b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0),
  );
  const preamble: RunTraceEvent[] = [];
  let i = 0;
  while (i < sorted.length && sorted[i].kind !== 'model_turn_start') {
    preamble.push(sorted[i]);
    i++;
  }
  const segments: TurnTimelineSegment[] = [];
  while (i < sorted.length) {
    const startTrace = sorted[i]!;
    const turnId = startTrace.turnId ?? segments.length + 1;
    i++;
    const inner: RunTraceEvent[] = [];
    while (i < sorted.length && sorted[i].kind !== 'model_turn_start') {
      inner.push(sorted[i]!);
      i++;
    }
    segments.push({ turnId, startTrace, traces: inner });
  }
  return { preamble, segments };
}

function TraceLine({ t }: { t: RunTraceEvent }) {
  const time = traceTimeLabel(t.at);
  return (
    <div
      className={`font-mono text-[9px] leading-snug ${STATUS_COLOR[t.status ?? ''] ?? 'text-fg-faint'}`}
      title={`${t.at} — ${t.kind}: ${t.label}`}
    >
      <span className="tabular-nums text-fg-faint/80">{time}</span>{' '}
      <span className="opacity-60">{t.kind}</span>{' '}
      <span className={t.status === 'error' ? 'text-error' : 'text-fg-muted'}>
        {t.label}
      </span>
    </div>
  );
}

function ThinkingBlock({
  slice,
  isStreaming,
  isActiveTurn,
  open,
  onToggle,
}: {
  slice?: ThinkingTurnSlice;
  isStreaming: boolean;
  isActiveTurn: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const text = slice?.text?.trim() ?? '';
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isStreaming || !isActiveTurn) return;
    const id = window.setInterval(() => setNow(Date.now()), 400);
    return () => clearInterval(id);
  }, [isStreaming, isActiveTurn]);

  const startedAt = slice?.startedAt ?? now;
  const endMs =
    slice?.endedAt ?? (isStreaming && isActiveTurn ? now : startedAt);
  const durationSec = Math.max(0, (endMs - startedAt) / 1000);

  const show = text.length > 0 || (isStreaming && isActiveTurn);
  if (!show) return null;

  return (
    <div className="mb-2 border-l-2 border-border-subtle pl-2">
      <button
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={onToggle}
        className="nodrag flex w-full items-center gap-1.5 rounded px-0 py-0.5 text-left text-[9px] text-fg-muted transition-colors hover:bg-surface-secondary/50 hover:text-fg-secondary"
      >
        {open ? (
          <ChevronDown size={12} className="shrink-0 opacity-70" />
        ) : (
          <ChevronRight size={12} className="shrink-0 opacity-70" />
        )}
        <Brain size={12} className="shrink-0 text-fg-faint" />
        <span className="font-medium">Thinking</span>
        <span className="tabular-nums text-fg-faint">
          ({durationSec < 10 ? durationSec.toFixed(1) : Math.round(durationSec)}
          s)
        </span>
        {isStreaming && isActiveTurn && (
          <span className="ml-1 inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
        )}
      </button>
      {open && (
        <pre className="mt-1 max-h-[min(40vh,320px)] overflow-y-auto whitespace-pre-wrap break-words rounded bg-surface-secondary/40 px-2 py-1.5 font-mono text-[9px] leading-snug text-fg-muted">
          {text || (isStreaming && isActiveTurn ? '…' : '')}
        </pre>
      )}
    </div>
  );
}

function ToolUseBlock({
  traces,
  isStreaming,
  isActiveTurn,
  open,
  onToggle,
}: {
  traces: RunTraceEvent[];
  isStreaming: boolean;
  isActiveTurn: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  if (traces.length === 0) return null;

  return (
    <div className="mb-2 border-l-2 border-border-subtle pl-2">
      <button
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={onToggle}
        className="nodrag flex w-full items-center gap-1.5 rounded px-0 py-0.5 text-left text-[9px] text-fg-muted transition-colors hover:bg-surface-secondary/50 hover:text-fg-secondary"
      >
        {open ? (
          <ChevronDown size={12} className="shrink-0 opacity-70" />
        ) : (
          <ChevronRight size={12} className="shrink-0 opacity-70" />
        )}
        <Wrench size={12} className="shrink-0 text-fg-faint" />
        <span className="font-medium">Tool use</span>
        <span className="tabular-nums text-fg-faint">({traces.length})</span>
        {isStreaming && isActiveTurn && (
          <span className="ml-1 inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
        )}
      </button>
      {open && (
        <div className="mt-1 max-h-[min(40vh,320px)] space-y-px overflow-y-auto rounded bg-surface-secondary/40 px-2 py-1.5">
          {traces.map((t) => (
            <TraceLine key={t.id} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Trace + per-turn thinking + markdown output, with sticky-bottom scroll follow.
 */
export function Timeline({
  trace,
  thinkingTurns,
  activityByTurn,
  activityLog,
  isStreaming = false,
}: {
  trace?: RunTraceEvent[];
  thinkingTurns?: ThinkingTurnSlice[];
  activityByTurn?: Record<number, string>;
  activityLog?: string[];
  isStreaming?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const followLatestRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [thinkingExpanded, setThinkingExpanded] = useState<
    Record<number, boolean | undefined>
  >({});
  const [toolUseExpanded, setToolUseExpanded] = useState<
    Record<number, boolean | undefined>
  >({});

  const thinkingMap = useMemo(() => {
    const m = new Map<number, ThinkingTurnSlice>();
    for (const row of thinkingTurns ?? []) m.set(row.turnId, row);
    return m;
  }, [thinkingTurns]);

  const { preamble, segments } = useMemo(
    () => buildTurnSegments(trace ?? []),
    [trace],
  );

  const activeTurnId = useMemo(
    () => (segments.length ? segments[segments.length - 1]!.turnId : 0),
    [segments],
  );

  const fallbackActivity = activityLog?.join('') ?? '';

  const resolvedThinkingOpen = useCallback(
    (turnId: number) => {
      if (thinkingExpanded[turnId] !== undefined) {
        return thinkingExpanded[turnId]!;
      }
      return isStreaming && turnId === activeTurnId;
    },
    [thinkingExpanded, isStreaming, activeTurnId],
  );

  const toggleThinking = useCallback(
    (turnId: number) => {
      setThinkingExpanded((prev) => {
        const currentlyOpen =
          prev[turnId] !== undefined
            ? prev[turnId]!
            : isStreaming && turnId === activeTurnId;
        return { ...prev, [turnId]: !currentlyOpen };
      });
    },
    [isStreaming, activeTurnId],
  );

  const resolvedToolUseOpen = useCallback(
    (turnId: number) => {
      if (toolUseExpanded[turnId] !== undefined) {
        return toolUseExpanded[turnId]!;
      }
      return isStreaming && turnId === activeTurnId;
    },
    [toolUseExpanded, isStreaming, activeTurnId],
  );

  const toggleToolUse = useCallback(
    (turnId: number) => {
      setToolUseExpanded((prev) => {
        const currentlyOpen =
          prev[turnId] !== undefined
            ? prev[turnId]!
            : isStreaming && turnId === activeTurnId;
        return { ...prev, [turnId]: !currentlyOpen };
      });
    },
    [isStreaming, activeTurnId],
  );

  const scrollFingerprint = useMemo(() => {
    const thLen = (thinkingTurns ?? []).reduce((n, t) => n + t.text.length, 0);
    const actLen =
      activityByTurn != null
        ? Object.values(activityByTurn).join('').length
        : fallbackActivity.length;
    return `${trace?.length ?? 0}:${thLen}:${actLen}`;
  }, [trace?.length, thinkingTurns, activityByTurn, fallbackActivity.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !followLatestRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [scrollFingerprint]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = dist < NEAR_BOTTOM_PX;
    followLatestRef.current = near;
    setShowJump(!near && isStreaming);
  }, [isStreaming]);

  const jumpToLatest = useCallback(() => {
    const el = scrollRef.current;
    followLatestRef.current = true;
    setShowJump(false);
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, []);

  const hasTrace = !!trace && trace.length > 0;
  const hasSegments = segments.length > 0;
  const hasAnyOutput =
    fallbackActivity.length > 0 ||
    (activityByTurn != null && Object.keys(activityByTurn).length > 0) ||
    (thinkingTurns != null && thinkingTurns.some((t) => t.text.length > 0));

  const streamBodyNoTrace =
    fallbackActivity ||
    (activityByTurn
      ? Object.keys(activityByTurn)
          .map(Number)
          .sort((a, b) => a - b)
          .map((k) => activityByTurn[k])
          .join('')
      : '');

  if (!hasTrace && hasAnyOutput && streamBodyNoTrace) {
    return (
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="nodrag nowheel max-h-full min-h-0 overflow-y-auto px-3 py-1.5 text-fg-muted"
        >
          <StreamdownTimeline
            mode={isStreaming ? 'streaming' : 'static'}
            isAnimating={isStreaming}
            className="streamdown-timeline"
          >
            {streamBodyNoTrace}
          </StreamdownTimeline>
        </div>
        {showJump ? (
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={jumpToLatest}
            className="nodrag absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border-subtle bg-surface/95 px-3 py-1 text-[10px] font-medium text-fg-secondary shadow-md backdrop-blur-sm hover:bg-surface-raised hover:text-fg"
          >
            <ChevronsDown size={12} />
            Latest
          </button>
        ) : null}
      </div>
    );
  }

  if (!hasTrace && !hasAnyOutput) {
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-center p-4">
        <div className="flex flex-col gap-2">
          <div className="h-3 w-4/5 animate-pulse rounded bg-border/40" />
          <div
            className="h-2.5 w-full animate-pulse rounded bg-border/30"
            style={{ animationDelay: '75ms' }}
          />
          <div
            className="h-2.5 w-[90%] animate-pulse rounded bg-border/30"
            style={{ animationDelay: '150ms' }}
          />
          <div
            className="h-2.5 w-3/4 animate-pulse rounded bg-border/30"
            style={{ animationDelay: '225ms' }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="nodrag nowheel max-h-full min-h-0 overflow-y-auto px-3 py-1.5"
      >
        {!hasSegments && hasTrace && (
          <>
            <div className="mb-2 space-y-px">
              {trace!.map((t) => (
                <TraceLine key={t.id} t={t} />
              ))}
            </div>
            {fallbackActivity ? (
              <div className="text-fg-muted">
                <StreamdownTimeline
                  mode={isStreaming ? 'streaming' : 'static'}
                  isAnimating={isStreaming}
                  className="streamdown-timeline"
                >
                  {fallbackActivity}
                </StreamdownTimeline>
              </div>
            ) : null}
          </>
        )}

        {hasSegments && (
          <>
            {preamble.length > 0 && (
              <div className="mb-3 space-y-px">
                {preamble.map((t) => (
                  <TraceLine key={t.id} t={t} />
                ))}
              </div>
            )}

            {segments.map((seg, segIdx) => {
              const slice = thinkingMap.get(seg.turnId);
              const { toolUse: toolUseTraces, rest: otherTraces } =
                partitionToolUseTraces(seg.traces);
              const rawText =
                activityByTurn?.[seg.turnId] ??
                (segIdx === segments.length - 1 && !activityByTurn
                  ? fallbackActivity
                  : '');
              const isActive = seg.turnId === activeTurnId;

              return (
                <div key={seg.turnId} className="mb-3">
                  <TraceLine t={seg.startTrace} />

                  <ThinkingBlock
                    slice={slice}
                    isStreaming={isStreaming}
                    isActiveTurn={isActive}
                    open={resolvedThinkingOpen(seg.turnId)}
                    onToggle={() => toggleThinking(seg.turnId)}
                  />

                  <ToolUseBlock
                    traces={toolUseTraces}
                    isStreaming={isStreaming}
                    isActiveTurn={isActive}
                    open={resolvedToolUseOpen(seg.turnId)}
                    onToggle={() => toggleToolUse(seg.turnId)}
                  />

                  {otherTraces.length > 0 && (
                    <div className="mb-2 space-y-px">
                      {otherTraces.map((t) => (
                        <TraceLine key={t.id} t={t} />
                      ))}
                    </div>
                  )}

                  {rawText ? (
                    <div className="text-fg-muted">
                      <StreamdownTimeline
                        mode={isStreaming && isActive ? 'streaming' : 'static'}
                        isAnimating={isStreaming && isActive}
                        className="streamdown-timeline"
                      >
                        {rawText}
                      </StreamdownTimeline>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </>
        )}
      </div>

      {showJump ? (
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={jumpToLatest}
          className="nodrag absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border-subtle bg-surface/95 px-3 py-1 text-[10px] font-medium text-fg-secondary shadow-md backdrop-blur-sm hover:bg-surface-raised hover:text-fg"
        >
          <ChevronsDown size={12} />
          Latest
        </button>
      ) : null}
    </div>
  );
}
