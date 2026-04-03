import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { TodoItem } from '../../../types/provider';
import type { AgenticPhase } from '../../../types/evaluation';

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
  const lastModelTokenSec =
    lastActivityAt != null ? Math.max(0, Math.floor((now - lastActivityAt) / 1000)) : undefined;
  const lastTraceSec =
    lastTraceAt != null ? Math.max(0, Math.floor((now - lastTraceAt) / 1000)) : undefined;
  const showFileStall = fileStallSec >= 40;
  const firstFileWait =
    isBuilding && written === 0 && lastAgentFileAt == null && elapsed >= 50;

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
          {(activeToolName || activeToolPath) && !toolLineRedundant && (
            <span className="pl-[18px] text-nano leading-snug text-fg-muted">
              Tool:{' '}
              <span className="text-fg-secondary">
                {activeToolName ?? 'running'}
                {activeToolPath ? ` · ${activeToolPath}` : ''}
              </span>
            </span>
          )}
          {(lastModelTokenSec != null || lastTraceSec != null) && (
            <span className="pl-[18px] text-nano leading-snug text-fg-muted">
              {lastModelTokenSec != null
                ? lastModelTokenSec === 0
                  ? 'Model output updating'
                  : `Last model output ${lastModelTokenSec}s ago`
                : 'No model output yet'}
              {lastTraceSec != null ? ` · last trace ${lastTraceSec}s ago` : ''}
            </span>
          )}
          {(showFileStall || firstFileWait) && (
            <span className="pl-[18px] text-nano leading-snug text-warning">
              {firstFileWait
                ? `No files saved yet after ${elapsed}s — planning or drafting first write may be slow on this model.`
                : `No new file saved for ${fileStallSec}s — the model may still be streaming a large write_file argument (typical for big CSS/HTML). Check the activity log; cancel and retry if it is clearly stuck.`}
            </span>
          )}
        </div>
        <span className="shrink-0 tabular-nums text-nano leading-tight text-fg-muted">{elapsed}s</span>
      </div>
    </div>
  );
}
