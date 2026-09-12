import type { GenerationResult } from '../../../types/provider';
import { Badge } from '@ds/components/ui/badge';
import { useTaskConfigStore } from '../../../stores/task-config-store';

interface VariantFooterProps {
  result: GenerationResult | undefined;
}

/**
 * Which model produced this result, and whether that is still the current one.
 *
 * `result.metadata.model` is written once, when the run is created, and never
 * rewritten — it is a record of what built *that version*, not a statement
 * about current configuration. That distinction was invisible in the UI, and it
 * cost real time: a `v1` card labelled `minimax/minimax-m2.5` read as "this app
 * is still on MiniMax" when it actually meant "this version was built back when
 * MiniMax was the default".
 *
 * So the label now says which it is. A result from a model that is no longer the
 * effective default is marked `(older run)`; anything the current config would
 * produce is shown plainly. Model selection is per task, so a result is compared
 * against the `design` task, which is what generates previews.
 */
export default function VariantFooter({ result }: VariantFooterProps) {
  const currentModelId = useTaskConfigStore((s) => s.getEffective('design').modelId);
  const resultModel = result?.metadata?.model;
  const isOutdatedModel = !!resultModel && resultModel !== currentModelId;

  return (
    <div className="flex items-center gap-1.5 border-t border-border-subtle px-2.5 py-1 font-mono text-nano text-fg-muted">
      {result?.runNumber != null && (
        <Badge shape="tab" tone="accent">v{result.runNumber}</Badge>
      )}
      {resultModel && (
        <span
          className="truncate"
          title={
            isOutdatedModel
              ? `Built with ${resultModel}. The current default for this task is ${currentModelId}.`
              : `Built with ${resultModel}.`
          }
        >
          {resultModel}
          {isOutdatedModel ? (
            <span className="ml-1 text-fg-faint">(older run)</span>
          ) : null}
        </span>
      )}
      {result?.metadata?.durationMs != null && (
        <>
          <span>&middot;</span>
          <span>{(result.metadata.durationMs / 1000).toFixed(1)}s</span>
        </>
      )}
      {result?.metadata?.tokensUsed != null && (
        <>
          <span>&middot;</span>
          <span>{result.metadata.tokensUsed.toLocaleString()} tok</span>
        </>
      )}
      {result?.metadata?.truncated && (
        <span className="text-warning">(truncated)</span>
      )}
    </div>
  );
}
