import { useEffect, useRef, useState } from 'react';
import { Brain, Loader2, MessageSquare, Wrench } from 'lucide-react';
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

/** Duration in whole seconds of the most recently closed thinking turn, or null. */
function lastClosedThinkingDuration(state: TaskStreamState): number | null {
  const turns = state.thinkingTurns;
  if (!turns) return null;
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]!;
    if (t.endedAt != null) return Math.max(1, Math.round((t.endedAt - t.startedAt) / 1000));
  }
  return null;
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
  const streamMode = state.streamMode;

  // Show a transient "🧠 Xs" badge for 3.5s after a thinking turn closes.
  const wasThinkingRef = useRef(false);
  const [lastThoughtSec, setLastThoughtSec] = useState<number | null>(null);
  useEffect(() => {
    if (wasThinkingRef.current && !isActivelyThinking) {
      const dur = lastClosedThinkingDuration(state);
      if (dur != null && dur > 0) {
        setLastThoughtSec(dur);
        const id = window.setTimeout(() => setLastThoughtSec(null), 3500);
        wasThinkingRef.current = false;
        return () => window.clearTimeout(id);
      }
    }
    wasThinkingRef.current = isActivelyThinking;
  }, [isActivelyThinking, state]);

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
                title={`${state.streamedModelChars} streamed characters (≈ ${tokChip} tokens, ${streamMode ?? 'working'})`}
                className="inline-flex items-center gap-1"
              >
                {streamMode === 'thinking' ? (
                  <Brain size={10} className="shrink-0 text-accent" aria-label="thinking" />
                ) : streamMode === 'tool' ? (
                  <Wrench size={10} className="shrink-0 text-accent" aria-label="tool" />
                ) : streamMode === 'narrating' ? (
                  <MessageSquare size={10} className="shrink-0 text-accent" aria-label="narrating" />
                ) : (
                  <span aria-hidden>↓</span>
                )}
                {tokChip} tokens
              </span>
            ) : null}
            {lastThoughtSec != null && !isActivelyThinking ? (
              <>
                <span aria-hidden>·</span>
                <span
                  className="inline-flex items-center gap-0.5 text-fg-faint"
                  title={`Reasoned for ${lastThoughtSec}s`}
                  aria-label={`thought for ${lastThoughtSec} seconds`}
                >
                  <Brain size={9} className="shrink-0 text-accent" aria-hidden />
                  {lastThoughtSec}s
                </span>
              </>
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
