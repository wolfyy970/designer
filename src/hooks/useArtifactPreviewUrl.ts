import { useEffect, useRef, useState } from 'react';
import { encodeVirtualPathForUrl } from '../lib/preview-entry';
import { bundleVirtualFS } from '../lib/iframe-utils';

type PreviewState = {
  previewSrc: string | null;
  fallbackSrcDoc: string | null;
  isPending: boolean;
};

/**
 * Registers virtual files with the API for URL-backed iframe preview (multi-page-safe).
 * Falls back to bundled srcDoc when the API is unreachable (e.g. API down).
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
    setState((s) => ({ ...s, isPending: true }));

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const prevId = sessionRef.current;
          if (prevId) {
            void fetch(`/api/preview/sessions/${prevId}`, { method: 'DELETE' }).catch(() => {});
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
            void fetch(`/api/preview/sessions/${body.id}`, { method: 'DELETE' }).catch(() => {});
            return;
          }
          sessionRef.current = body.id;
          const pathEnc = encodeVirtualPathForUrl(body.entry);
          setState({
            previewSrc: `/api/preview/sessions/${body.id}/${pathEnc}`,
            fallbackSrcDoc: null,
            isPending: false,
          });
        } catch {
          try {
            const bundled = bundleVirtualFS(files);
            if (!cancelled) {
              setState({
                previewSrc: null,
                fallbackSrcDoc: bundled,
                isPending: false,
              });
            }
          } catch {
            if (!cancelled) {
              setState({ previewSrc: null, fallbackSrcDoc: null, isPending: false });
            }
          }
        }
      })();
    }, debounceMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      const sid = sessionRef.current;
      if (sid) {
        void fetch(`/api/preview/sessions/${sid}`, { method: 'DELETE' }).catch(() => {});
        sessionRef.current = null;
      }
    };
  }, [files, debounceMs]);

  return state;
}
