import { RF_INTERACTIVE } from '../../../constants/canvas';
import type { GenerationResult } from '../../../types/provider';
import { Button } from '@ds/components/ui/button';
import { AgenticHarnessStripe } from '../variant-run';
import TaskStreamMonitor from './TaskStreamMonitor';
import type { TaskStreamState } from '../../../hooks/task-stream-state';

type Props = {
  result: GenerationResult;
  elapsed: number;
  /** When true, run workspace overlay is open for this variant — hide the redundant CTA. */
  isWorkspaceOpen: boolean;
  onOpenWorkspace: () => void;
};

/**
 * Projects the live `GenerationResult` slice the preview-node generating shell
 * cares about into the shared `TaskStreamState` shape so both simple tasks
 * (inputs-gen, incubate, hypothesis auto-gen) and the richer design run render
 * through one `TaskStreamMonitor`. The monitor renders only the fields we
 * populate — tool rows, plan counts, skill strips, etc. are intentionally
 * omitted (the full detail lives in the run workspace when you open it).
 */
function resultToMonitorState(result: GenerationResult): TaskStreamState {
  return {
    status: 'streaming',
    progressMessage: result.progressMessage,
    activityLog: result.activityLog,
    streamedModelChars: result.streamedModelChars,
  };
}

/** In-node shell while a run is streaming — optional link to the full run workspace overlay. */
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
        ? 'Updating from evaluator feedback — full task list and preview are in the run workspace.'
        : 'Updating from evaluator feedback — follow progress here; use Watch agent for the full monitor, files, and preview.';
    }
    return isWorkspaceOpen
      ? 'Generating — full tasks, activity, and preview are in the run workspace.'
      : 'Generating — follow progress here. Use Watch agent for the full monitor, files, and live preview.';
  })();

  return (
    <div className="absolute inset-0 flex flex-col bg-surface">
      <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-3 px-4 py-3">
        <AgenticHarnessStripe
          layout="inline"
          phase={result.agenticPhase}
          evaluationStatus={result.evaluationStatus}
          progressMessage={result.progressMessage}
        />
        <p className="text-center text-micro text-fg-secondary">{centerBlurb}</p>
        {!isWorkspaceOpen ? (
          <Button
            type="button"
            variant="secondary"
            size="md"
            className={RF_INTERACTIVE}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenWorkspace();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenWorkspace();
            }}
          >
            Watch agent
          </Button>
        ) : null}
      </div>
      <div className="border-t border-border-subtle p-3">
        <TaskStreamMonitor
          state={resultToMonitorState(result)}
          elapsed={elapsed}
          fallbackLabel={isRevising ? 'Revising…' : 'Agent working…'}
        />
      </div>
    </div>
  );
}
