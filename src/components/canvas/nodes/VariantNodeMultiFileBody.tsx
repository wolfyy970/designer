import FileExplorer from './FileExplorer';
import { ArtifactPreviewFrame } from '../variant-run';

type Props = {
  variantName: string;
  zoom: number;
  currentFiles: Record<string, string>;
  activeTab: 'preview' | 'code';
  onTabChange: (tab: 'preview' | 'code') => void;
  activeCodeFile: string | undefined;
  onSelectCodeFile: (path: string | undefined) => void;
};

/** Multi-file complete: preview/code tabs + explorer. */
export function VariantNodeMultiFileBody({
  variantName,
  zoom,
  currentFiles,
  activeTab,
  onTabChange,
  activeCodeFile,
  onSelectCodeFile,
}: Props) {
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex border-b border-border-subtle bg-surface shrink-0">
        {(['preview', 'code'] as const).map((tab) => (
          <button
            key={tab}
            onPointerDown={() => onTabChange(tab)}
            className={`nodrag px-3 py-1.5 text-nano font-medium capitalize transition-colors ${
              activeTab === tab
                ? 'border-b border-accent text-fg'
                : 'text-fg-muted hover:text-fg-secondary'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
      {activeTab === 'preview' && (
        <div className="relative flex-1 overflow-hidden">
          <ArtifactPreviewFrame
            files={currentFiles}
            title={`Variant: ${variantName}`}
            className="absolute left-0 top-0 border-0 bg-preview-canvas"
            style={{
              width: `${100 / zoom}%`,
              height: `${100 / zoom}%`,
              transform: `scale(${zoom})`,
              transformOrigin: '0 0',
              pointerEvents: 'auto',
            }}
          />
        </div>
      )}
      {activeTab === 'code' && (
        <div className="flex flex-1 overflow-hidden">
          <div className="w-28 shrink-0 border-r border-border-subtle bg-surface flex flex-col">
            <div className="px-2 py-1.5 border-b border-border-subtle">
              <span className="text-badge font-medium uppercase tracking-wider text-fg-faint">
                Files
              </span>
            </div>
            <FileExplorer
              files={currentFiles}
              activeFile={activeCodeFile}
              onSelectFile={onSelectCodeFile}
              isGenerating={false}
              className="flex-1"
            />
          </div>
          <div className="nodrag nowheel flex-1 overflow-auto bg-bg">
            <pre className="min-h-full p-3 font-mono text-nano leading-relaxed text-fg-secondary whitespace-pre-wrap">
              {activeCodeFile && currentFiles[activeCodeFile]}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
