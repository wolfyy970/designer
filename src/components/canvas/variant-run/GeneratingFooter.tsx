import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { LivenessSlice, TodoItem } from '../../../types/provider';
import {
  FILE_STALL_WARN_SEC,
  FIRST_FILE_WAIT_ELAPSED_SEC,
  modelQuietSeconds,
  STREAM_QUIET_WARN_SEC,
} from '../../../lib/generation-liveness';
import { formatStreamArgSize } from '../../../lib/format-stream-arg-size';

export function GeneratingFooter({
  plan,
  written,
  elapsed,
  liveness,
  liveTodos,
  liveSkills,
  liveActivatedSkills,
}: {
  plan: string[] | undefined;
  written: number;
  elapsed: number;
  liveness: LivenessSlice;
  liveTodos?: TodoItem[];
  liveSkills?: { key: string; name: string; description: string }[];
  /** Skills successfully loaded via use_skill this run. */
  liveActivatedSkills?: { key: string; name: string; description: string }[];
}) {
  const {
    progressMessage,
    lastAgentFileAt,
    lastActivityAt,
    lastTraceAt,
    activeToolName,
    activeToolPath,
    streamingToolName,
    streamingToolPath,
    streamingToolChars,
    agenticPhase,
    evaluationStatus,
  } = liveness;
  const total = plan?.length ?? 0;
  const hasPlan = total > 0;
  const progress = hasPlan ? written / total : 0;
  const isBuilding = !agenticPhase || agenticPhase === 'building';
  const isEvaluating = agenticPhase === 'evaluating';
  const isRevising = agenticPhase === 'revising';

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const todoHint = useMemo(() => {
    if (!liveTodos?.length) return undefined;
    const cur = liveTodos.find((t) => t.status === 'in_progress')?.task;
    if (cur) return { label: 'Current' as const, task: cur };
    const next = liveTodos.find((t) => t.status === 'pending')?.task;
    if (next) return { label: 'Next' as const, task: next };
    return undefined;
  }, [liveTodos]);

  const activeToolLabel = useMemo(() => {
    if (!activeToolName) return undefined;
    return activeToolPath ? `${activeToolName} → ${activeToolPath}` : activeToolName;
  }, [activeToolName, activeToolPath]);

  const noPlanBuildingLine = useMemo(() => {
    if (!isBuilding) return progressMessage || 'Generating…';
    if (progressMessage && progressMessage !== 'Generating…') return progressMessage;
    if (activeToolLabel) {
      return written > 0 ? `${written} file(s) · ${activeToolLabel}` : activeToolLabel;
    }
    if (written > 0) return `${written} design file(s) saved`;
    return 'Exploring & generating…';
  }, [isBuilding, progressMessage, activeToolLabel, written]);

  const primaryLine = isEvaluating
    ? (evaluationStatus || progressMessage || 'Running evaluators…')
    : isRevising
      ? (evaluationStatus || progressMessage || 'Revising…')
      : hasPlan
        ? `${written} / ${total} files`
        : noPlanBuildingLine;

  const toolLineRedundant = useMemo(() => {
    if (!isBuilding || hasPlan || !activeToolName) return false;
    if (activeToolPath && primaryLine.includes(activeToolPath)) return true;
    return primaryLine.includes(activeToolName);
  }, [isBuilding, hasPlan, activeToolName, activeToolPath, primaryLine]);

  const isStreamingToolArgs = isBuilding && streamingToolName != null;

  const fileStallSec =
    isBuilding && lastAgentFileAt != null && (!hasPlan || written < total)
      ? Math.max(0, Math.floor((now - lastAgentFileAt) / 1000))
      : 0;
  const modelQuietSec = modelQuietSeconds(now, lastActivityAt, lastTraceAt);
  const showStreamQuietWarning =
    isBuilding &&
    !isStreamingToolArgs &&
    modelQuietSec != null &&
    modelQuietSec >= STREAM_QUIET_WARN_SEC;
  const showFileStall =
    !isStreamingToolArgs && fileStallSec >= FILE_STALL_WARN_SEC;
  const firstFileWait =
    !isStreamingToolArgs &&
    isBuilding &&
    written === 0 &&
    lastAgentFileAt == null &&
    elapsed >= FIRST_FILE_WAIT_ELAPSED_SEC;

  const modelActivityDetail = (() => {
    if (!isBuilding || isStreamingToolArgs || modelQuietSec == null) return null;
    if (modelQuietSec === 0) return 'Model activity updating';
    if (modelQuietSec < 30) return 'Model reasoning…';
    if (modelQuietSec < STREAM_QUIET_WARN_SEC) return `Last model activity ${modelQuietSec}s ago`;
    return null;
  })();

  const activatedKeys = useMemo(
    () => new Set((liveActivatedSkills ?? []).map((s) => s.key)),
    [liveActivatedSkills],
  );

  return (
    <div className="flex flex-col gap-2 border-t border-border-subtle px-4 py-3">
      {hasPlan && isBuilding ? (
        <div className="h-1 w-full overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full bg-accent/70 transition-all duration-500"
            style={{ width: `${Math.min(progress * 100, 100)}%` }}
          />
        </div>
      ) : (
        <div className="h-1 w-full overflow-hidden rounded-full bg-border">
          <div className="h-full w-full animate-pulse rounded-full bg-accent/60" />
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-1.5 text-nano leading-tight text-fg-secondary">
            <Loader2 size={10} className="shrink-0 animate-spin text-accent" />
            <span className="truncate">{primaryLine}</span>
          </span>
          {(isEvaluating || isRevising) && hasPlan && (
            <span className="pl-[18px] text-nano leading-snug text-fg-muted">
              Build: {written} / {total} files
            </span>
          )}
          {(isEvaluating || isRevising) && !hasPlan && written > 0 && (
            <span className="pl-[18px] text-nano leading-snug text-fg-muted">
              Saved {written} design file{written === 1 ? '' : 's'}
            </span>
          )}
          {hasPlan && progressMessage && progressMessage !== primaryLine && !isEvaluating && !isRevising && (
            <span
              className="pl-[18px] text-nano leading-snug text-fg-muted"
              title={progressMessage}
            >
              {progressMessage}
            </span>
          )}
          {isStreamingToolArgs && (
            <span className="flex items-center gap-1.5 pl-[18px] text-nano leading-snug text-fg-secondary">
              <span
                className="inline-block size-1.5 shrink-0 animate-pulse rounded-full bg-accent"
                aria-hidden
              />
              <span className="min-w-0">
                Streaming <code className="text-fg-secondary">{streamingToolName}</code>
                {streamingToolPath != null && streamingToolPath.length > 0 ? (
                  <>
                    {' '}
                    → <span className="text-fg-muted">{streamingToolPath}</span>
                  </>
                ) : null}
                <span className="text-fg-muted">
                  {' '}
                  ({formatStreamArgSize(streamingToolChars ?? 0)})
                </span>
              </span>
            </span>
          )}
          {todoHint && (
            <span className="pl-[18px] text-nano leading-snug text-fg-muted">
              {todoHint.label}: <span className="text-fg-secondary">{todoHint.task}</span>
            </span>
          )}
          {liveSkills != null && liveSkills.length > 0 && (
            <span className="pl-[18px] text-nano leading-snug text-fg-muted">
              Skills (✓ = use_skill):{' '}
              {liveSkills.map((s, i) => (
                <span key={s.key}>
                  {i > 0 ? ', ' : ''}
                  <span
                    className={activatedKeys.has(s.key) ? 'text-fg-secondary' : 'text-fg-faint'}
                    title={s.description}
                  >
                    {activatedKeys.has(s.key) ? '✓ ' : ''}
                    {s.name}
                  </span>
                </span>
              ))}
            </span>
          )}
          {liveSkills != null && liveSkills.length === 0 && isBuilding && (
            <span className="pl-[18px] text-nano leading-snug text-fg-faint">
              Skills: no catalog entries (configure under <code>skills/</code> or all are{' '}
              <code>manual</code>)
            </span>
          )}
          {(activeToolName || activeToolPath) && !toolLineRedundant && !isStreamingToolArgs && (
            <span className="pl-[18px] text-nano leading-snug text-fg-muted">
              Tool:{' '}
              <span className="text-fg-secondary">
                {activeToolName ?? 'running'}
                {activeToolPath ? ` · ${activeToolPath}` : ''}
              </span>
            </span>
          )}
          {modelActivityDetail != null && (
            <span className="pl-[18px] text-nano leading-snug text-fg-muted">{modelActivityDetail}</span>
          )}
          {showStreamQuietWarning && (
            <span className="pl-[18px] text-nano leading-snug text-warning">
              No model or tool trace for {modelQuietSec}s — the run may still be working (slow
              reasoning or provider queue). Use Stop if you believe it is stuck.
            </span>
          )}
          {(showFileStall || firstFileWait) && (
            <span className="pl-[18px] text-nano leading-snug text-warning">
              {firstFileWait
                ? `Also: No files saved yet after ${elapsed}s — planning or drafting first write may be slow on this model.`
                : `Also: No new file saved for ${fileStallSec}s — the model may still be streaming a large write_file argument (typical for big CSS/HTML). Check the activity log; use Stop if it is clearly stuck.`}
            </span>
          )}
        </div>
        <span className="shrink-0 tabular-nums text-nano leading-tight text-fg-muted">{elapsed}s</span>
      </div>
    </div>
  );
}
