import { Brain, Loader2 } from 'lucide-react';
import type { TaskStreamState } from '../../../hooks/task-stream-state';
import { RF_INTERACTIVE } from '../../../constants/canvas';
import { formatElapsedCompact, formatTokEstimate } from '../../../lib/stream-display-format';

type Props = {
  state: TaskStreamState;
  /** Elapsed seconds from `useElapsedTimer` */
  elapsed?: number;
  /** Optional label for the top line when no progress message yet */
  fallbackLabel?: string;
};

/** A thinking turn is "active" when its endedAt is not set. */
function hasOpenThinkingTurn(state: TaskStreamState): boolean {
  const turns = state.thinkingTurns;
  if (!turns || turns.length === 0) return false;
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i]!.endedAt == null) return true;
  }
  return false;
}

/**
 * Unified live feedback for every Pi task stream in the canvas
 * (inputs-gen, incubate, hypothesis auto-generate).
 *
 * Deliberately narrow: the user needs to see that **something is happening**
 * and roughly how much progress the model has streamed; they do NOT need
 * tool names, file paths, plan counts, skill summaries, or stop-reason echoes.
 * Rich per-run detail belongs in the run inspector, not in the node card.
 *
 * Layout (always two rows, second row optional):
 *   1. [spinner] status-label                 ~N tok · Ns
 *   2. latest model line (one-line excerpt, italic muted)
 *
 * When the run completes, the parent unmounts this component and the
 * generated content replaces it in the textarea / node body.
 */
export default function TaskStreamMonitor({
  state,
  elapsed,
  fallbackLabel = 'Agent working…',
}: Props) {
  const progress = state.progressMessage?.trim() || fallbackLabel;
  const latestActivity =
    state.activityLog && state.activityLog.length > 0
      ? state.activityLog[state.activityLog.length - 1]?.trim()
      : undefined;
  const tokChip = formatTokEstimate(state.streamedModelChars);
  const isActivelyThinking = hasOpenThinkingTurn(state);

  return (
    <div
      className={`${RF_INTERACTIVE} flex flex-col gap-1.5 rounded-md border border-border-subtle bg-surface-raised px-3 py-2.5 text-nano text-fg-muted`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Loader2 size={14} className="shrink-0 animate-spin text-accent" aria-hidden />
          <span className="min-w-0 break-words leading-snug text-fg-secondary">{progress}</span>
        </div>
        {(tokChip || elapsed != null) && (
          <div
            className="flex shrink-0 items-center gap-1.5 font-mono tabular-nums text-fg-faint"
            aria-live="polite"
          >
            {elapsed != null ? <span>{formatElapsedCompact(elapsed)}</span> : null}
            {tokChip && elapsed != null ? <span aria-hidden>·</span> : null}
            {tokChip ? (
              <span
                title={`${state.streamedModelChars} streamed characters (≈ ${tokChip} tokens${isActivelyThinking ? ', reasoning' : ''})`}
                className="inline-flex items-center gap-1"
              >
                {isActivelyThinking ? (
                  <Brain size={10} className="shrink-0 text-accent" aria-label="thinking" />
                ) : (
                  <span aria-hidden>↓</span>
                )}
                {tokChip} tokens
              </span>
            ) : null}
          </div>
        )}
      </div>

      {latestActivity && latestActivity.length > 0 ? (
        <p
          className="line-clamp-1 italic break-words text-micro leading-snug text-fg-muted"
          title={latestActivity}
        >
          {latestActivity}
        </p>
      ) : null}
    </div>
  );
}
