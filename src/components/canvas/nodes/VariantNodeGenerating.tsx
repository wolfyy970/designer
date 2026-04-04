import { RF_INTERACTIVE } from '../../../constants/canvas';
import type { GenerationResult } from '../../../types/provider';
import { AgenticHarnessStripe, GeneratingFooter } from '../variant-run';
import { pickLivenessSlice } from '../../../types/provider';

type Props = {
  result: GenerationResult;
  elapsed: number;
  /** When true, run workspace side panel is already open for this variant — hide the redundant CTA. */
  isWorkspaceOpen: boolean;
  onOpenWorkspace: () => void;
};

/** In-node shell while a run is streaming — links to side workspace. */
export function VariantNodeGenerating({
  result,
  elapsed,
  isWorkspaceOpen,
  onOpenWorkspace,
}: Props) {
  const isRevising = result.agenticPhase === 'revising';
  const centerBlurb = (() => {
    if (isRevising) {
      return isWorkspaceOpen
        ? 'Updating the design from evaluator feedback — tasks and preview are in the run workspace.'
        : 'Updating the design from evaluator feedback — open the side panel for tasks, activity, and preview.';
    }
    return isWorkspaceOpen
      ? 'Generating — tasks, activity, and preview are in the run workspace (side panel).'
      : 'Generating in workspace — open the side panel for tasks, activity, and preview.';
  })();

  return (
    <div className="absolute inset-0 flex flex-col bg-surface">
      <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-3 px-4 py-3">
        <AgenticHarnessStripe
          phase={result.agenticPhase}
          evaluationStatus={result.evaluationStatus}
          progressMessage={result.progressMessage}
        />
        <p className="text-center text-micro text-fg-secondary">{centerBlurb}</p>
        {!isWorkspaceOpen ? (
          <button
            type="button"
            className={`${RF_INTERACTIVE} rounded-md border border-accent-border-muted bg-accent-surface px-3 py-1.5 text-micro font-medium text-accent transition-colors hover:bg-accent-surface-hover`}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenWorkspace();
            }}
          >
            Open workspace
          </button>
        ) : null}
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
