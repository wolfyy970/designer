import { Hourglass, Loader2 } from 'lucide-react';
import type { GenerationProgress } from '../../../hooks/hypothesis-generate-flow';
import { RF_INTERACTIVE } from '../../../constants/canvas';
import { Button } from '@ds/components/ui/button';
import { Badge } from '@ds/components/ui/badge';

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
}: Props) {
  const disabled = isGenerating || !canGenerate || serverAtCapacity;
  return (
    <div className={RF_INTERACTIVE}>
      {hint && (
        <div className="mb-1.5 flex justify-center">
          <Badge shape="pill" tone="warning">{hint}</Badge>
        </div>
      )}
      <Button
        variant="primary"
        size="md"
        className="w-full"
        onClick={onGenerate}
        disabled={disabled}
        aria-busy={isGenerating}
        title={
          serverAtCapacity
            ? `Server is at capacity (${activeGenerationsCount}/${maxConcurrentRuns} agentic runs). Wait for one to finish.`
            : undefined
        }
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
          'Design'
        )}
      </Button>
      {isGenerating ? (
        <Button
          variant="destructive"
          size="md"
          className="mt-2 w-full"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onStop}
        >
          Stop
        </Button>
      ) : null}
    </div>
  );
}
