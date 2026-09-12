import { Loader2 } from 'lucide-react';
import { ArtifactPreviewFrame } from '../variant-run';
import { RoundSelector } from './RoundSelector';

/**
 * The Design tab body: round selector, load state, and the preview itself.
 *
 * Extracted from `VariantRunInspector`. The caller owns the resolution of
 * *which* files to show (`resolveRoundFileView`) and passes the outcome in, so
 * this component stays a rendering concern and keeps no state of its own.
 */
export function VariantRunDesignTab({
  rounds,
  safeRoundIdx,
  lastRoundNum,
  onSelectRoundIndex,
  codeLoading,
  filesLoading,
  isRunComplete,
  /** An older round is selected and its snapshot is not available in any form. */
  roundSnapshotUnavailable,
  /** An older round is selected and its snapshot is still being read. */
  roundSnapshotLoading,
  /** The selected round is the run's latest round. */
  isLatestRound,
  variantName,
  isGenerating,
  designIsMultiFile,
  designPreviewFiles,
  singleFileSrc,
}: {
  rounds: readonly { round: number }[];
  safeRoundIdx: number;
  lastRoundNum: number | undefined;
  onSelectRoundIndex: (index: number) => void;
  codeLoading: boolean;
  filesLoading: boolean;
  isRunComplete: boolean;
  roundSnapshotUnavailable: boolean;
  roundSnapshotLoading: boolean;
  isLatestRound: boolean;
  variantName: string;
  isGenerating: boolean;
  designIsMultiFile: boolean;
  designPreviewFiles: Record<string, string> | undefined;
  singleFileSrc: string | undefined;
}) {
  const showBody = !codeLoading && !filesLoading && !roundSnapshotUnavailable;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg">
      <RoundSelector
        rounds={rounds}
        selectedIndex={safeRoundIdx}
        lastRoundNum={lastRoundNum}
        onSelectIndex={onSelectRoundIndex}
      />
      {(codeLoading || filesLoading) && isRunComplete && (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 size={20} className="animate-spin text-fg-muted" />
        </div>
      )}
      {isRunComplete && roundSnapshotLoading && (
        <div className="flex flex-1 items-center justify-center px-3">
          <Loader2 size={18} className="animate-spin text-fg-muted" />
        </div>
      )}
      {showBody && designIsMultiFile && designPreviewFiles && (
        <ArtifactPreviewFrame
          files={designPreviewFiles}
          title={`Design preview: ${variantName}`}
          className="min-h-[var(--min-height-input-textarea)] flex-1 border-0 bg-preview-canvas"
        />
      )}
      {showBody && !designIsMultiFile && singleFileSrc && (
        <iframe
          title={`Design preview: ${variantName}`}
          sandbox="allow-scripts"
          srcDoc={singleFileSrc}
          className="min-h-[var(--min-height-input-textarea)] flex-1 border-0 bg-preview-canvas"
        />
      )}
      {showBody && !designIsMultiFile && !singleFileSrc && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <p className="text-nano text-fg-muted">
            {isGenerating
              ? 'Preview appears when the first artifact is ready.'
              : rounds.length > 1 && !isLatestRound
                ? 'No file snapshot for this round (re-run agentic to capture).'
                : 'No preview available.'}
          </p>
        </div>
      )}
    </div>
  );
}
