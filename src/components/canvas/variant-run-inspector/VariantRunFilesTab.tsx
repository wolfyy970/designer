import { Loader2 } from 'lucide-react';
import { RF_INTERACTIVE } from '../../../constants/canvas';
import FileExplorer from '../nodes/FileExplorer';
import { RoundSelector } from './RoundSelector';

/**
 * The Files tab body: round selector, file explorer, and the selected file's
 * contents.
 *
 * Extracted from `VariantRunInspector`. The two load-state predicates are now
 * derived from the resolver's `kind` rather than re-spelled here — the originals
 * read `rounds.length > 1 && !isLatestEvalRound && !roundFilesFromIdb &&
 * !selectedRound?.files`, a fourth hand-written copy of the same decision.
 */
export function VariantRunFilesTab({
  rounds,
  safeRoundIdx,
  lastRoundNum,
  onSelectRoundIndex,
  codeLoading,
  filesLoading,
  isRunComplete,
  roundSnapshotLoading,
  roundSnapshotMissing,
  writtenFiles,
  plannedFiles,
  activeFilePath,
  onSelectFile,
  isGenerating,
  writingFile,
  fileSnippet,
}: {
  rounds: readonly { round: number }[];
  safeRoundIdx: number;
  lastRoundNum: number | undefined;
  onSelectRoundIndex: (index: number) => void;
  codeLoading: boolean;
  filesLoading: boolean;
  isRunComplete: boolean;
  roundSnapshotLoading: boolean;
  roundSnapshotMissing: boolean;
  writtenFiles: Record<string, string>;
  plannedFiles: string[] | undefined;
  activeFilePath: string | undefined;
  onSelectFile: (path: string | undefined) => void;
  isGenerating: boolean;
  writingFile: string | undefined;
  fileSnippet: string | undefined;
}) {
  const hasFiles = Object.keys(writtenFiles).length > 0 || (plannedFiles?.length ?? 0) > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-bg">
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
      {isRunComplete && (roundSnapshotLoading || roundSnapshotMissing) && (
        <div className="flex flex-1 items-center justify-center px-3">
          <Loader2 size={18} className="animate-spin text-fg-muted" />
        </div>
      )}
      {!codeLoading && !filesLoading && !roundSnapshotLoading && !roundSnapshotMissing && hasFiles && (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="flex w-[var(--width-inspector-tab)] shrink-0 flex-col border-r border-border-subtle bg-surface">
            <div className="border-b border-border-subtle px-2 py-1.5">
              <span className="text-badge font-medium uppercase tracking-wider text-fg-faint">
                Files
              </span>
            </div>
            <FileExplorer
              files={writtenFiles}
              plannedFiles={plannedFiles}
              activeFile={activeFilePath}
              onSelectFile={onSelectFile}
              isGenerating={isGenerating}
              writingFile={writingFile}
              allowSelectPlanned
              className="flex-1 min-h-0"
            />
          </div>
          <div className={`${RF_INTERACTIVE} min-h-0 min-w-0 flex-1 overflow-y-auto`}>
            {fileSnippet != null ? (
              <pre className="min-h-full p-3 font-mono text-nano leading-relaxed text-fg-secondary whitespace-pre-wrap">
                {fileSnippet}
              </pre>
            ) : (
              <p className="p-3 text-nano text-fg-muted">
                {activeFilePath
                  ? 'Not written yet — watch the Monitor stream for updates.'
                  : 'No files in this run.'}
              </p>
            )}
          </div>
        </div>
      )}
      {!codeLoading &&
        !filesLoading &&
        !roundSnapshotLoading &&
        !roundSnapshotMissing &&
        !hasFiles && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
            <p className="text-nano text-fg-muted">
              {isGenerating
                ? 'Paths appear here when the agent plans and writes files.'
                : 'No project files for this run.'}
            </p>
          </div>
        )}    </div>
  );
}
