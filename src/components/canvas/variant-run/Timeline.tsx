import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Brain, Wrench } from 'lucide-react';
import type { RunTraceEvent, StreamingToolLiveness, ThinkingTurnSlice } from '../../../types/provider';
import { StreamdownTimeline } from './StreamdownTimeline.tsx';
import { formatStreamArgSize } from '../../../lib/format-stream-arg-size';
import {
  TimelineAccordionChrome,
  TimelineEmptyStateSkeleton,
  TimelineJumpToLatest,
} from './timeline-parts.tsx';

const NEAR_BOTTOM_PX = 48;

const STATUS_COLOR: Record<string, string> = {
  error: 'text-error',
  warning: 'text-warning',
  success: 'text-success',
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
      className={`font-mono text-badge leading-snug ${STATUS_COLOR[t.status ?? ''] ?? 'text-fg-faint'}`}
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
    <TimelineAccordionChrome
      open={open}
      onToggle={onToggle}
      icon={<Brain size={12} className="shrink-0 text-fg-faint" />}
      title="Thinking"
      trailing={
        <>
          <span className="tabular-nums text-fg-faint">
            ({durationSec < 10 ? durationSec.toFixed(1) : Math.round(durationSec)}s)
          </span>
          {isStreaming && isActiveTurn && (
            <span className="ml-1 inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          )}
        </>
      }
    >
      {open ? (
        <pre className="mt-1 max-h-[var(--max-height-timeline-scroll)] overflow-y-auto whitespace-pre-wrap break-words rounded bg-surface-nested/40 px-2 py-1.5 font-mono text-badge leading-snug text-fg-muted">
          {text || (isStreaming && isActiveTurn ? '…' : '')}
        </pre>
      ) : null}
    </TimelineAccordionChrome>
  );
}

function ToolUseBlock({
  traces,
  isStreaming,
  isActiveTurn,
  open,
  onToggle,
  streamingToolName,
  streamingToolPath,
  streamingToolChars,
}: {
  traces: RunTraceEvent[];
  isStreaming: boolean;
  isActiveTurn: boolean;
  open: boolean;
  onToggle: () => void;
  streamingToolName?: string;
  streamingToolPath?: string;
  streamingToolChars?: number;
}) {
  const isStreamingArgs =
    isStreaming && isActiveTurn && streamingToolName != null;
  if (traces.length === 0 && !isStreamingArgs) return null;

  const headerLabel = isStreamingArgs
    ? streamingToolPath
      ? `${streamingToolName} → ${streamingToolPath}`
      : streamingToolName
    : undefined;

  return (
    <TimelineAccordionChrome
      open={open}
      onToggle={onToggle}
      icon={<Wrench size={12} className="shrink-0 text-fg-faint" />}
      title="Tool use"
      trailing={
        <>
          {traces.length > 0 && (
            <span className="tabular-nums text-fg-faint">({traces.length})</span>
          )}
          {isStreamingArgs && (
            <>
              <span className="ml-1 inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              <span className="min-w-0 truncate text-fg-secondary">
                {headerLabel}
                <span className="ml-1 text-fg-faint">
                  ({formatStreamArgSize(streamingToolChars ?? 0)})
                </span>
              </span>
            </>
          )}
          {!isStreamingArgs && isStreaming && isActiveTurn && (
            <span className="ml-1 inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          )}
        </>
      }
    >
      {open ? (
        <div className="mt-1 max-h-[var(--max-height-timeline-scroll)] space-y-px overflow-y-auto rounded bg-surface-nested/40 px-2 py-1.5">
          {traces.map((t) => (
            <TraceLine key={t.id} t={t} />
          ))}
          {isStreamingArgs && (
            <div className="flex items-center gap-1.5 font-mono text-badge leading-snug text-fg-secondary">
              <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              <span>
                Streaming <code>{streamingToolName}</code>
                {streamingToolPath ? ` → ${streamingToolPath}` : ''}
              </span>
              <span className="text-fg-faint">
                ({formatStreamArgSize(streamingToolChars ?? 0)})
              </span>
            </div>
          )}
        </div>
      ) : null}
    </TimelineAccordionChrome>
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
  streamingLiveness,
}: {
  trace?: RunTraceEvent[];
  thinkingTurns?: ThinkingTurnSlice[];
  activityByTurn?: Record<number, string>;
  activityLog?: string[];
  isStreaming?: boolean;
  streamingLiveness?: StreamingToolLiveness;
}) {
  const streamingToolName = streamingLiveness?.streamingToolName;
  const streamingToolPath = streamingLiveness?.streamingToolPath;
  const streamingToolChars = streamingLiveness?.streamingToolChars;
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
    return `${trace?.length ?? 0}:${thLen}:${actLen}:${streamingToolChars ?? 0}`;
  }, [trace?.length, thinkingTurns, activityByTurn, fallbackActivity.length, streamingToolChars]);

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
        {showJump ? <TimelineJumpToLatest onClick={jumpToLatest} /> : null}
      </div>
    );
  }

  if (!hasTrace && !hasAnyOutput) {
    return <TimelineEmptyStateSkeleton />;
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
                    streamingToolName={isActive ? streamingToolName : undefined}
                    streamingToolPath={isActive ? streamingToolPath : undefined}
                    streamingToolChars={isActive ? streamingToolChars : undefined}
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

      {showJump ? <TimelineJumpToLatest onClick={jumpToLatest} /> : null}
    </div>
  );
}
