import { Loader2 } from 'lucide-react';
import type { TaskStreamState } from '../../../hooks/task-stream-state';
import { StreamingToolRow } from '../variant-run/StreamingToolRow';
import { RF_INTERACTIVE } from '../../../constants/canvas';

type Props = {
  state: TaskStreamState;
  /** Elapsed seconds from `useElapsedTimer` */
  elapsed?: number;
  /** Optional label for the top line when no progress message yet */
  fallbackLabel?: string;
};

/**
 * Compact live feedback for Pi task streams (incubate, inputs-gen) — fits inside node cards.
 */
export default function TaskStreamMonitor({ state, elapsed, fallbackLabel = 'Working…' }: Props) {
  const progress =
    state.progressMessage?.trim() ||
    (state.agenticPhase === 'complete' ? 'Finalizing…' : null) ||
    fallbackLabel;

  const latestActivity =
    state.activityLog && state.activityLog.length > 0
      ? state.activityLog[state.activityLog.length - 1]?.trim()
      : undefined;

  const skillHint =
    state.liveSkills != null && state.liveSkills.length > 0
      ? `${state.liveSkills.length} skill${state.liveSkills.length !== 1 ? 's' : ''} loaded`
      : null;

  return (
    <div
      className={`${RF_INTERACTIVE} flex flex-col gap-2 rounded-md border border-border-subtle bg-surface-raised px-3 py-2.5 text-nano text-fg-muted`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Loader2 size={14} className="shrink-0 animate-spin text-accent" aria-hidden />
          <span className="min-w-0 break-words leading-snug text-fg-secondary">{progress}</span>
        </div>
        {elapsed != null ? (
          <span className="shrink-0 tabular-nums text-fg-faint">{elapsed}s</span>
        ) : null}
      </div>

      {state.streamingToolName != null && state.streamingToolChars != null ? (
        <StreamingToolRow
          toolName={state.streamingToolName}
          toolPath={state.streamingToolPath}
          streamedChars={state.streamingToolChars}
          className="flex items-start gap-1.5 text-micro leading-snug"
        />
      ) : null}

      {state.activeToolName != null && state.streamingToolName == null ? (
        <p className="text-micro text-fg-muted">
          Tool: <code className="text-fg-secondary">{state.activeToolName}</code>
          {state.activeToolPath ? (
            <>
              {' '}
              → <span className="text-fg-faint">{state.activeToolPath}</span>
            </>
          ) : null}
        </p>
      ) : null}

      {latestActivity && latestActivity.length > 0 ? (
        <p className="line-clamp-2 break-words text-micro leading-snug text-fg-muted" title={latestActivity}>
          {latestActivity}
        </p>
      ) : null}

      {state.codePreview != null && state.codePreview.length > 0 && !latestActivity ? (
        <p className="line-clamp-2 break-words font-mono text-micro leading-snug text-fg-faint" title={state.codePreview}>
          {state.codePreview}
        </p>
      ) : null}

      {state.lastWrittenFilePath != null ? (
        <p className="text-micro text-fg-faint">
          File: <span className="text-fg-muted">{state.lastWrittenFilePath}</span>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-micro text-fg-faint">
        {skillHint != null ? <span>{skillHint}</span> : null}
        {state.plannedFileCount != null ? <span>{state.plannedFileCount} planned</span> : null}
        {state.liveTodosCount != null && state.liveTodosCount > 0 ? (
          <span>{state.liveTodosCount} open tasks</span>
        ) : null}
        {state.agenticPhase != null && state.agenticPhase !== 'building' ? (
          <span className="capitalize">{state.agenticPhase}</span>
        ) : null}
      </div>
    </div>
  );
}
