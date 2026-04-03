import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { TodoItem } from '../../../types/provider';
import type { AgenticPhase } from '../../../types/evaluation';
import {
  FILE_STALL_WARN_SEC,
  FIRST_FILE_WAIT_ELAPSED_SEC,
  modelQuietSeconds,
  STREAM_QUIET_WARN_SEC,
} from '../../../lib/generation-liveness';

export function GeneratingFooter({
  plan,
  written,
  progressMessage,
  elapsed,
  lastAgentFileAt,
  lastActivityAt,
  lastTraceAt,
  activeToolName,
  activeToolPath,
  liveTodos,
  liveSkills,
  agenticPhase,
  evaluationStatus,
}: {
  plan: string[] | undefined;
  written: number;
  progressMessage: string | undefined;
  elapsed: number;
  lastAgentFileAt?: number;
  lastActivityAt?: number;
  lastTraceAt?: number;
  activeToolName?: string;
  activeToolPath?: string;
  liveTodos?: TodoItem[];
  liveSkills?: { key: string; name: string; description: string }[];
  agenticPhase?: AgenticPhase;
  evaluationStatus?: string;
}) {
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

  const fileStallSec =
    isBuilding && lastAgentFileAt != null && (!hasPlan || written < total)
      ? Math.max(0, Math.floor((now - lastAgentFileAt) / 1000))
      : 0;
  const modelQuietSec = modelQuietSeconds(now, lastActivityAt, lastTraceAt);
  const showStreamQuietWarning =
    isBuilding && modelQuietSec != null && modelQuietSec >= STREAM_QUIET_WARN_SEC;
  const showFileStall = fileStallSec >= FILE_STALL_WARN_SEC;
  const firstFileWait =
    isBuilding &&
    written === 0 &&
    lastAgentFileAt == null &&
    elapsed >= FIRST_FILE_WAIT_ELAPSED_SEC;

  const catalogTitles = useMemo(() => {
    if (!liveSkills?.length) return '';
    return liveSkills.map((s) => s.name).join(', ');
  }, [liveSkills]);

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
          {todoHint && (
            <span className="pl-[18px] text-nano leading-snug text-fg-muted">
              {todoHint.label}: <span className="text-fg-secondary">{todoHint.task}</span>
            </span>
          )}
          {liveSkills != null && liveSkills.length > 0 && (
            <span className="pl-[18px] text-nano leading-snug text-fg-muted">
              Skills (pre-seeded, read when relevant):{' '}
              <span
                className="text-fg-secondary"
                title={liveSkills.map((s) => s.description).join(' · ')}
              >
                {catalogTitles}
              </span>
            </span>
          )}
          {liveSkills != null && liveSkills.length === 0 && isBuilding && (
            <span className="pl-[18px] text-nano leading-snug text-fg-faint">
              Skills: no catalog entries (configure under <code>skills/</code> or all are{' '}
              <code>manual</code>)
            </span>
          )}
          {(activeToolName || activeToolPath) && !toolLineRedundant && (
            <span className="pl-[18px] text-nano leading-snug text-fg-muted">
              Tool:{' '}
              <span className="text-fg-secondary">
                {activeToolName ?? 'running'}
                {activeToolPath ? ` · ${activeToolPath}` : ''}
              </span>
            </span>
          )}
          {modelQuietSec != null && (
            <span className="pl-[18px] text-nano leading-snug text-fg-muted">
              {modelQuietSec === 0
                ? 'Model activity updating'
                : `Last model activity ${modelQuietSec}s ago`}
            </span>
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
