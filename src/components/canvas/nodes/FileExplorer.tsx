import { useRef } from 'react';
import { RF_INTERACTIVE } from '../../../constants/canvas';
import { File, FileCode, Paintbrush, Braces, FileJson } from 'lucide-react';
import { StatusDot } from '@ds/components/ui/status-dot';

interface FileExplorerProps {
  files: Record<string, string>;
  plannedFiles?: string[];
  activeFile: string | undefined;
  onSelectFile: (path: string) => void;
  isGenerating: boolean;
  writingFile?: string;
  /** When true, paths that exist only in the plan (not yet written) are selectable. */
  allowSelectPlanned?: boolean;
  className?: string;
}

function fileIcon(path: string) {
  if (path.endsWith('.html')) return <FileCode size={11} className="shrink-0 text-file-html" />;
  if (path.endsWith('.css')) return <Paintbrush size={11} className="shrink-0 text-file-css" />;
  if (path.endsWith('.js') || path.endsWith('.ts')) return <Braces size={11} className="shrink-0 text-file-script" />;
  if (path.endsWith('.json')) return <FileJson size={11} className="shrink-0 text-file-data" />;
  return <File size={11} className="shrink-0 text-fg-muted" />;
}

export default function FileExplorer({
  files,
  plannedFiles,
  activeFile,
  onSelectFile,
  isGenerating,
  writingFile,
  allowSelectPlanned = false,
  className = '',
}: FileExplorerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Merge written + planned-but-unwritten into a single ordered list
  const writtenSet = new Set(Object.keys(files));
  const allPaths = plannedFiles
    ? [...plannedFiles, ...Object.keys(files).filter((p) => !plannedFiles.includes(p))]
    : Object.keys(files).sort();

  // Group by top-level directory
  const groups: Record<string, string[]> = {};
  for (const path of allPaths) {
    const slash = path.indexOf('/');
    const dir = slash === -1 ? '' : path.slice(0, slash);
    if (!groups[dir]) groups[dir] = [];
    groups[dir].push(path);
  }

  return (
    <div
      ref={scrollRef}
      className={`${RF_INTERACTIVE} overflow-y-auto ${className}`}
    >
      {Object.entries(groups).map(([dir, groupPaths]) => (
        <div key={dir}>
          {dir && (
            <div className="px-2 py-1 text-badge font-medium uppercase tracking-wider text-fg-faint truncate">
              {dir}/
            </div>
          )}
          {groupPaths.map((path) => {
            const filename = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
            const isWritten = writtenSet.has(path);
            const isActive = path === activeFile;
            const isWriting = isGenerating && path === writingFile;
            const isPlannedOnly = !isWritten;
            const canSelect = isWritten || allowSelectPlanned;
            return (
              <button
                key={path}
                type="button"
                onPointerDown={() => canSelect && onSelectFile(path)}
                disabled={!canSelect}
                className={`nodrag flex w-full items-center gap-1.5 px-2 py-1 text-left transition-colors ${
                  !canSelect
                    ? 'cursor-default opacity-35'
                    : isPlannedOnly
                      ? isActive
                        ? 'bg-accent-highlight text-fg opacity-90'
                        : 'cursor-pointer text-fg-muted opacity-80 hover:bg-surface-raised hover:opacity-100'
                      : isActive
                        ? 'bg-accent-highlight text-fg'
                        : 'text-fg-secondary hover:bg-surface-raised'
                }`}
              >
                {fileIcon(path)}
                <span className="truncate text-micro leading-tight flex-1">{filename}</span>
                {isWriting && <StatusDot tone="accent" animated aria-label="Writing…" />}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
