import { Loader2, AlertCircle } from 'lucide-react';

type Props = {
  codeLoading: boolean;
  code: string | undefined;
  htmlContent: string;
  variantName: string;
  zoom: number;
};

/** Single-file complete: loading, missing, or iframe preview. */
export function VariantNodeSingleFileBody({
  codeLoading,
  code,
  htmlContent,
  variantName,
  zoom,
}: Props) {
  return (
    <>
      {codeLoading && (
        <div className="flex h-full items-center justify-center bg-surface">
          <Loader2 size={14} className="animate-spin text-fg-muted" />
        </div>
      )}

      {!codeLoading && !code && (
        <div className="flex h-full flex-col items-center justify-center bg-surface p-4">
          <AlertCircle size={16} className="mb-2 text-fg-muted" />
          <p className="text-center text-xs text-fg-muted">
            Code unavailable — may need to regenerate
          </p>
        </div>
      )}

      {code && (
        <iframe
          srcDoc={htmlContent}
          sandbox="allow-scripts"
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
      )}
    </>
  );
}
