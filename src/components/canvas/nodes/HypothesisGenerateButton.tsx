import { Hourglass, Loader2, Zap } from 'lucide-react';
import type { GenerationProgress } from '../../../hooks/hypothesis-generate-flow';
import type { StrategyStreamingSnapshot } from '../../../lib/strategy-streaming-snapshot';
import { RF_INTERACTIVE } from '../../../constants/canvas';
import { StreamingToolRow } from '../variant-run/StreamingToolRow';

function smallNumberToWord(n: number): string {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  return n <= 10 ? words[n]! : n.toString();
}

type Props = {
  hint: string | null;
  isGenerating: boolean;
  canGenerate: boolean;
  /** True when server slot cap is reached and this node is idle (another run may be using slots). */
  serverAtCapacity: boolean;
  /** In-flight GENERATING rows (matches server slots for hypothesis/design runs in this session). */
  activeGenerationsCount: number;
  maxConcurrentRuns: number;
  onGenerate: () => void;
  onStop: () => void;
  generationProgress: GenerationProgress | null;
  streamingSnap: StrategyStreamingSnapshot | null;
};

export function HypothesisGenerateButton({
  hint,
  isGenerating,
  canGenerate,
  serverAtCapacity,
  activeGenerationsCount,
  maxConcurrentRuns,
  onGenerate,
  onStop,
  generationProgress,
  streamingSnap,
}: Props) {
  const disabled = isGenerating || !canGenerate || serverAtCapacity;
  return (
    <div className={RF_INTERACTIVE}>
      {hint && (
        <div className="mb-1.5 flex justify-center">
          <span className="inline-flex items-center rounded-full border border-warning-border bg-warning-subtle px-2 py-0.5 font-mono text-nano text-warning">
            {hint}
          </span>
        </div>
      )}
      <button
        type="button"
        onClick={onGenerate}
        disabled={disabled}
        aria-busy={isGenerating}
        title={
          serverAtCapacity
            ? `Server is at capacity (${activeGenerationsCount}/${maxConcurrentRuns} agentic runs). Wait for one to finish.`
            : undefined
        }
        className="flex w-full items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isGenerating ? (
          <>
            <Loader2 size={12} className="animate-spin" aria-hidden />
            {generationProgress && generationProgress.total > 1
              ? generationProgress.completed === 0
                ? `Designing ${smallNumberToWord(generationProgress.total)} previews…`
                : `${generationProgress.completed} of ${generationProgress.total} ready…`
              : 'Designing…'}
          </>
        ) : serverAtCapacity ? (
          <>
            <Hourglass size={12} className="shrink-0 opacity-90" aria-hidden />
            Server busy ({activeGenerationsCount}/{maxConcurrentRuns})
          </>
        ) : (
          <>
            <Zap size={12} className="shrink-0 opacity-90" aria-hidden />
            Design
          </>
        )}
      </button>
      {isGenerating && streamingSnap != null ? (
        <p className="mt-1.5 text-center text-nano leading-snug text-fg-secondary">
          <StreamingToolRow
            toolName={streamingSnap.name}
            toolPath={streamingSnap.path}
            streamedChars={streamingSnap.chars}
            className="inline-flex flex-wrap items-center justify-center gap-1.5 text-nano leading-snug text-fg-secondary"
          />
        </p>
      ) : null}
      {isGenerating ? (
        <p className="mt-1.5 text-center text-nano leading-snug text-fg-muted">
          Stopping ends the server request; partial output may remain on the card.
        </p>
      ) : null}
      {isGenerating ? (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onStop}
          className="mt-2 w-full rounded-md border border-error-border bg-error-subtle px-3 py-2 text-xs font-semibold text-error transition-colors hover:bg-error-surface-hover"
        >
          Stop generation
        </button>
      ) : null}
    </div>
  );
}
