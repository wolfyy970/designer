import type { GenerationResult } from '../../../types/provider';
import { pickLivenessSlice, pickStreamingToolLiveness } from '../../../types/provider';
import {
  AgenticHarnessStripe,
  GeneratingFooter,
  Timeline,
  TodoTracker,
} from '../variant-run';

/**
 * The Monitor tab body: the live progress strip, the task list, and the
 * streaming timeline.
 *
 * Extracted from `VariantRunInspector`, which held all four tab bodies inline
 * and was the highest-complexity function in the repo. This one is genuinely
 * self-contained — it needs the result, whether the run is streaming, and the
 * elapsed timer value, and derives the rest itself.
 */
export function VariantRunMonitorTab({
  result,
  isGenerating,
  elapsed,
}: {
  result: GenerationResult | undefined;
  isGenerating: boolean;
  elapsed: number;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Generating progress strip (fixed, above resizable panels) */}
      {isGenerating && result && (
        <div className="shrink-0 border-b border-border-subtle">
          <AgenticHarnessStripe
            phase={result.agenticPhase}
            evaluationStatus={result.evaluationStatus}
            progressMessage={result.progressMessage}
          />
          <GeneratingFooter
            plan={result.liveFilesPlan}
            written={Object.keys(result.liveFiles ?? {}).length}
            elapsed={elapsed}
            liveness={pickLivenessSlice(result)}
            liveTodos={result.liveTodos}
            skillCatalogEmpty={result.liveSkills != null && result.liveSkills.length === 0}
            liveActivatedSkills={result.liveActivatedSkills}
          />
        </div>
      )}

      {/* Tasks — fixed, auto-height, fits content snugly */}
      <div className="shrink-0 border-b border-border-subtle">
        <div className="flex items-center bg-surface-nested/40 px-3 py-0.5">
          <span className="text-pico font-semibold uppercase tracking-widest text-fg-faint">
            Tasks
          </span>
        </div>
        {result?.liveTodos && result.liveTodos.length > 0 ? (
          <TodoTracker todos={result.liveTodos} />
        ) : (
          <p className="px-3 py-1.5 text-nano text-fg-muted">
            {isGenerating ? 'Planning…' : 'No tasks.'}
          </p>
        )}
      </div>

      {/* Unified timeline — trace events + model output in one scroll */}
      <Timeline
        trace={result?.liveTrace}
        thinkingTurns={result?.thinkingTurns}
        activityByTurn={result?.activityByTurn}
        activityLog={result?.activityLog}
        isStreaming={isGenerating}
        streamingLiveness={result ? pickStreamingToolLiveness(result) : undefined}
      />
    </div>
  );
}
