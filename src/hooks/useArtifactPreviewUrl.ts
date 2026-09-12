import { useEffect, useRef, useState } from 'react';
import { encodeVirtualPathForUrl } from '../lib/preview-entry';
import { bundleVirtualFS } from '../lib/iframe-utils';
import { normalizeError } from '../lib/error-utils';
import { cleanupPreviewSession } from '../lib/preview-session-cleanup';

type PreviewState = {
  previewSrc: string | null;
  fallbackSrcDoc: string | null;
  isPending: boolean;
};

/**
 * Registers virtual files with the API for URL-backed iframe preview (multi-page-safe).
 * Bundles a `srcDoc` fallback ONLY when URL registration fails — exposing both upfront
 * causes a visible double-render (srcDoc iframe paints, then unmounts when URL arrives).
 */
export function useArtifactPreviewUrl(
  files: Record<string, string> | null | undefined,
  debounceMs = 200,
): PreviewState {
  const [state, setState] = useState<PreviewState>({
    previewSrc: null,
    fallbackSrcDoc: null,
    isPending: false,
  });
  const sessionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!files || Object.keys(files).length === 0) {
      setState({ previewSrc: null, fallbackSrcDoc: null, isPending: false });
      return;
    }

    let cancelled = false;
    setState({ previewSrc: null, fallbackSrcDoc: null, isPending: true });

    const computeFallback = (): string | null => {
      try {
        return bundleVirtualFS(files);
      } catch (bundleErr) {
        console.warn(
          '[preview] bundleVirtualFS fallback failed:',
          normalizeError(bundleErr),
        );
        return null;
      }
    };

    /**
     * Bundled upfront, not only on the failure path. A session that registers
     * and verifies successfully can still fail in the browser afterwards: the
     * ephemeral session may expire or be evicted between our verification GET
     * and the iframe's own request. Without a bundle already in hand, that
     * iframe has nothing to fall back to and the card shows the server's 404
     * body inside the design frame — the "agent built something broken" look.
     */
    const fallbackSrcDoc = computeFallback();

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const prevId = sessionRef.current;
          if (prevId) {
            cleanupPreviewSession(prevId);
            sessionRef.current = null;
          }

          const res = await fetch('/api/preview/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files }),
          });
          if (!res.ok) throw new Error(`preview register ${res.status}`);
          const body = (await res.json()) as { id: string; entry: string };
          if (cancelled) {
            cleanupPreviewSession(body.id);
            return;
          }
          sessionRef.current = body.id;
          const pathEnc = encodeVirtualPathForUrl(body.entry);
          const previewSrc = `/api/preview/sessions/${body.id}/${pathEnc}`;
          const verifyRes = await fetch(previewSrc, { method: 'GET' });
          if (!verifyRes.ok) throw new Error(`preview load ${verifyRes.status}`);
          if (cancelled) return;
          setState({
            previewSrc,
            fallbackSrcDoc,
            isPending: false,
          });
        } catch (registerErr) {
          const sid = sessionRef.current;
          if (sid) {
            cleanupPreviewSession(sid);
            sessionRef.current = null;
          }
          console.warn(
            '[preview] session registration failed, using srcDoc fallback:',
            normalizeError(registerErr),
          );
          if (!cancelled) {
            setState({
              previewSrc: null,
              fallbackSrcDoc,
              isPending: false,
            });
          }
        }
      })();
    }, debounceMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      const sid = sessionRef.current;
      if (sid) {
        cleanupPreviewSession(sid);
        sessionRef.current = null;
      }
    };
  }, [files, debounceMs]);

  return state;
}
