import type { GenerationResult } from '../../../types/provider';
import { AgenticHarnessStripe, GeneratingFooter } from '../variant-run';
import { pickLivenessSlice } from '../../../types/provider';

type Props = {
  result: GenerationResult;
  elapsed: number;
  onOpenWorkspace: () => void;
};

/** In-node shell while a run is streaming — links to side workspace. */
export function VariantNodeGenerating({ result, elapsed, onOpenWorkspace }: Props) {
  return (
    <div className="absolute inset-0 flex flex-col bg-surface">
      <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-3 px-4 py-3">
        <AgenticHarnessStripe
          phase={result.agenticPhase}
          evaluationStatus={result.evaluationStatus}
        />
        <p className="text-center text-micro text-fg-secondary">
          Generating in workspace — open the side panel for tasks, activity, and preview.
        </p>
        <button
          type="button"
          className="nodrag nowheel rounded-md border border-accent-border-muted bg-accent-surface px-3 py-1.5 text-micro font-medium text-accent transition-colors hover:bg-accent-surface-hover"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onOpenWorkspace();
          }}
        >
          Open workspace
        </button>
      </div>
      <GeneratingFooter
        plan={result.liveFilesPlan}
        written={Object.keys(result.liveFiles ?? {}).length}
        elapsed={elapsed}
        liveness={pickLivenessSlice(result)}
        liveTodos={result.liveTodos}
        liveSkills={result.liveSkills}
        liveActivatedSkills={result.liveActivatedSkills}
      />
    </div>
  );
}
