import { useMemo, useState, type CSSProperties } from 'react';
import { Loader2, TriangleAlert } from 'lucide-react';
import { useArtifactPreviewUrl } from '../../../hooks/useArtifactPreviewUrl';
import {
  checkArtifactIntegrity,
  describeArtifactIntegrity,
} from '../../../lib/artifact-integrity';

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
 *     produce an empty document.
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
 *
 * Also reports an *incomplete* artifact — an entry document referencing assets
 * that were never written — because that renders as an unstyled, broken-looking
 * page that is indistinguishable from a bad design. See `artifact-integrity.ts`.
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
  /**
   * Bumped by the "Reload preview" affordance. Used as the iframe `key` so a
   * reload tears the document down and re-requests every subresource instead of
   * reusing a cached miss. A stranded unstyled frame is otherwise only fixable
   * by the user discovering that switching tabs and back rebuilds it.
   */
  const [reloadCount, setReloadCount] = useState(0);
  const frameStyle: CSSProperties | undefined = interactive
    ? style
    : { ...style, pointerEvents: 'none' };

  const integrity = useMemo(() => checkArtifactIntegrity(files), [files]);
  const integrityNotice = describeArtifactIntegrity(integrity);

  /**
   * An incomplete tree is served from the inlined `srcDoc` bundle rather than the
   * URL route, even when a URL is available.
   *
   * During a multi-file build `liveFiles` gains entries one at a time, so there is
   * a window where the entry document exists and the assets it references do not.
   * Serving that tree over the URL route makes the browser request `styles.css`
   * and `app.js` and get real 404s — the frame paints unstyled, and a cached miss
   * can outlive the missing file. The bundle inlines whatever CSS/JS *is* present
   * and requests nothing, so an interrupted or mid-flight build degrades to
   * "styled by what exists" instead of "no styles at all".
   *
   * The warning strip still reports what is missing, so this hides nothing from
   * the viewer. Once the referenced files land, `integrity.incomplete` goes false
   * and the URL preview takes over.
   */
  const urlPreviewUsable =
    !!previewSrc && previewSrc !== failedSrc && !integrity.incomplete;

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

  /**
   * Warning strip above the frame. Rendered for both the URL and srcDoc paths
   * so the message survives a fallback — an incomplete build is incomplete
   * either way, and switching to srcDoc would otherwise hide it.
   *
   * Carries a reload affordance because a preview can also come up *unstyled*
   * without the artifact being at fault: if a subresource request loses a race
   * with the session's file map, the browser caches a miss for that URL and the
   * frame keeps rendering without its stylesheet. Changing this iframe's `key`
   * forces a fresh document and a fresh network request for every subresource,
   * which is exactly what switching tabs and back did by hand. One click instead
   * of discovering the workaround.
   */
  const notice = integrityNotice ? (
    <div
      role="status"
      className="flex shrink-0 items-start gap-1.5 border-b border-warning-border bg-warning-subtle px-2.5 py-1.5 text-nano text-warning"
    >
      <TriangleAlert size={11} className="mt-px shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">{integrityNotice}</span>
      <button
        type="button"
        onClick={() => setReloadCount((n) => n + 1)}
        className="nodrag shrink-0 rounded border border-warning-border px-1.5 py-0.5 font-medium transition-colors hover:bg-warning/10"
      >
        Reload preview
      </button>
    </div>
  ) : null;

  const wrap = (frame: React.ReactElement) =>
    notice ? (
      <div className="absolute inset-0 flex flex-col">
        {notice}
        <div className="relative min-h-0 flex-1">{frame}</div>
      </div>
    ) : (
      frame
    );

  if (previewSrc && urlPreviewUsable) {
    return wrap(
      <iframe
        // A new key tears the document down and re-requests every subresource.
        key={`url-${reloadCount}`}
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
      />,
    );
  }

  if (fallbackSrcDoc) {
    return wrap(
      <iframe
        key={`srcdoc-${reloadCount}`}
        srcDoc={fallbackSrcDoc}
        sandbox="allow-scripts"
        title={title}
        className={className}
        style={frameStyle}
      />,
    );
  }

  return notice ?? null;
}
