import { Loader2, Zap } from 'lucide-react';
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
  onGenerate: () => void;
  onStop: () => void;
  generationProgress: GenerationProgress | null;
  streamingSnap: StrategyStreamingSnapshot | null;
};

export function HypothesisGenerateButton({
  hint,
  isGenerating,
  canGenerate,
  onGenerate,
  onStop,
  generationProgress,
  streamingSnap,
}: Props) {
  return (
    <div className={RF_INTERACTIVE}>
      {hint && <p className="mb-1.5 text-center text-nano text-fg-muted">{hint}</p>}
      <button
        type="button"
        onClick={onGenerate}
        disabled={isGenerating || !canGenerate}
        aria-busy={isGenerating}
        className="flex w-full items-center justify-center gap-1.5 rounded-md bg-fg px-3 py-2 text-xs font-medium text-bg transition-colors hover:bg-fg-on-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
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
