import { useState, type CSSProperties } from 'react';
import { Loader2 } from 'lucide-react';
import { useArtifactPreviewUrl } from '../../../hooks/useArtifactPreviewUrl';

type Props = {
  files: Record<string, string>;
  title: string;
  className?: string;
  style?: CSSProperties;
  interactive?: boolean;
};

/** Exact body text `server/routes/preview.ts` returns for an unknown/expired session. */
const SERVER_NOT_FOUND_BODY = 'Not found';

/**
 * True when a URL-backed preview iframe rendered the server's miss page instead
 * of the design.
 *
 * Two signals, both narrow on purpose:
 *   - the exact body text `server/routes/preview.ts` returns for an
 *     unknown/expired session;
 *   - a body that rendered nothing at all (no text, no elements). The server's
 *     404 is `c.text('Not found', 404)`, but a proxy or a bare 404 can also
 *     produce an empty document — and `bundleVirtualFS` always emits a full
 *     document with content, so an empty body is never our bundle.
 *
 * Returns false for a document we cannot inspect: `contentDocument` is null
 * both for a cross-origin frame and for one whose navigation has not committed,
 * and jsdom's `about:blank` has no `body`. Treating those as failures would
 * abandon healthy previews, which is worse than showing one that is broken.
 */
function isFailedPreviewDocument(doc: Document | null): boolean {
  const body = doc?.body;
  if (!body) return false;
  if (body.textContent?.trim() === SERVER_NOT_FOUND_BODY) return true;
  return body.childElementCount === 0 && !body.textContent?.trim();
}

/**
 * Multi-file design preview: URL-backed virtual FS when API is available; bundled srcDoc fallback.
 */
export default function ArtifactPreviewFrame({
  files,
  title,
  className,
  style,
  interactive = true,
}: Props) {
  const { previewSrc, fallbackSrcDoc, isPending } = useArtifactPreviewUrl(files);
  /**
   * The specific URL that failed, rather than a boolean. A boolean needed a
   * reset whenever `previewSrc` changed — and that reset effect ran *after*
   * commit, i.e. after `onLoad` had already set the flag, so a detected failure
   * was erased on the spot and the broken frame stayed mounted with no
   * fallback. Keying on the URL makes the flag self-invalidating: a newly
   * registered URL is simply not the one that failed.
   */
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const frameStyle: CSSProperties | undefined = interactive
    ? style
    : { ...style, pointerEvents: 'none' };

  const urlPreviewUsable = !!previewSrc && previewSrc !== failedSrc;

  if (isPending) {
    return (
      <div
        className={`flex h-full items-center justify-center bg-surface ${className ?? ''}`}
        style={style}
      >
        <Loader2 size={16} className="animate-spin text-fg-muted" />
      </div>
    );
  }

  if (previewSrc && urlPreviewUsable) {
    return (
      <iframe
        src={previewSrc}
        // URL previews are served same-origin (/api/preview/...). They need
        // allow-same-origin so the bundle can use localStorage and parent postMessage;
        // Chrome may warn that scripts+same-origin weakens the sandbox — required for previews.
        sandbox="allow-scripts allow-same-origin"
        title={title}
        className={className}
        style={frameStyle}
        onLoad={(event) => {
          // Catch a miss that happened *after* registration-time verification:
          // an expired/evicted ephemeral session, or a fresh serverless
          // instance that never saw the POST. Without this the card displays
          // the server's 404 body inside the design frame, which reads as "the
          // agent built something broken".
          if (isFailedPreviewDocument(event.currentTarget.contentDocument)) {
            setFailedSrc(previewSrc);
          }
        }}
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
        style={frameStyle}
      />
    );
  }

  return null;
}
