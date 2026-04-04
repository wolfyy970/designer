import type { CSSProperties } from 'react';
import { Loader2 } from 'lucide-react';
import { useArtifactPreviewUrl } from '../../../hooks/useArtifactPreviewUrl';

type Props = {
  files: Record<string, string>;
  title: string;
  className?: string;
  style?: CSSProperties;
};

/**
 * Multi-file design preview: URL-backed virtual FS when API is available; bundled srcDoc fallback.
 */
export default function ArtifactPreviewFrame({ files, title, className, style }: Props) {
  const { previewSrc, fallbackSrcDoc, isPending } = useArtifactPreviewUrl(files);

  if (isPending && !fallbackSrcDoc) {
    return (
      <div
        className={`flex h-full items-center justify-center bg-surface ${className ?? ''}`}
        style={style}
      >
        <Loader2 size={16} className="animate-spin text-fg-muted" />
      </div>
    );
  }

  if (previewSrc) {
    return (
      <iframe
        src={previewSrc}
        sandbox="allow-scripts allow-same-origin"
        title={title}
        className={className}
        style={style}
      />
    );
  }

  if (fallbackSrcDoc) {
    return (
      <iframe
        srcDoc={fallbackSrcDoc}
        sandbox="allow-scripts"
        title={title}
        className={className}
        style={style}
      />
    );
  }

  return null;
}
