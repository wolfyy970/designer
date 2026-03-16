import { useRef } from 'react';
import { File, FileCode, Paintbrush, Braces, FileJson } from 'lucide-react';

interface FileExplorerProps {
  files: Record<string, string>;
  plannedFiles?: string[];
  activeFile: string | undefined;
  onSelectFile: (path: string) => void;
  isGenerating: boolean;
  writingFile?: string;
  className?: string;
}

function fileIcon(path: string) {
  if (path.endsWith('.html')) return <FileCode size={11} className="shrink-0 text-orange-400" />;
  if (path.endsWith('.css')) return <Paintbrush size={11} className="shrink-0 text-blue-400" />;
  if (path.endsWith('.js') || path.endsWith('.ts')) return <Braces size={11} className="shrink-0 text-yellow-400" />;
  if (path.endsWith('.json')) return <FileJson size={11} className="shrink-0 text-green-400" />;
  return <File size={11} className="shrink-0 text-fg-muted" />;
}

export default function FileExplorer({
  files,
  plannedFiles,
  activeFile,
  onSelectFile,
  isGenerating,
  writingFile,
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
      className={`nodrag nowheel overflow-y-auto ${className}`}
    >
      {Object.entries(groups).map(([dir, groupPaths]) => (
        <div key={dir}>
          {dir && (
            <div className="px-2 py-1 text-[9px] font-medium uppercase tracking-wider text-fg-faint truncate">
              {dir}/
            </div>
          )}
          {groupPaths.map((path) => {
            const filename = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
            const isWritten = writtenSet.has(path);
            const isActive = path === activeFile;
            const isWriting = isGenerating && path === writingFile;
            const isPlannedOnly = !isWritten;
            return (
              <button
                key={path}
                onPointerDown={() => isWritten && onSelectFile(path)}
                disabled={isPlannedOnly}
                className={`nodrag flex w-full items-center gap-1.5 px-2 py-1 text-left transition-colors ${
                  isPlannedOnly
                    ? 'cursor-default opacity-35'
                    : isActive
                      ? 'bg-accent/15 text-fg'
                      : 'text-fg-secondary hover:bg-surface-raised'
                }`}
              >
                {fileIcon(path)}
                <span className="truncate text-[10px] leading-tight flex-1">{filename}</span>
                {isWriting && (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent animate-pulse" />
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
