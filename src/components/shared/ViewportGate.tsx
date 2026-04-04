import { useState, useEffect } from 'react';
import { Monitor } from 'lucide-react';
import {
  VIEWPORT_DESKTOP_MIN_WIDTH_PX,
  getViewportGateMediaQuery,
} from '../../lib/viewport-gate';

function useIsNarrowViewport(): boolean | null {
  const [narrow, setNarrow] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(getViewportGateMediaQuery());
    setNarrow(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return narrow;
}

/**
 * Full-screen gate shown on viewports narrower than `VIEWPORT_DESKTOP_MIN_WIDTH_PX` (see `viewport-gate.ts`).
 * Returns `null` (render children) on desktop, the fallback on mobile/tablet,
 * and nothing during SSR / first paint to avoid a flash.
 */
export function ViewportGate({ children }: { children: React.ReactNode }) {
  const narrow = useIsNarrowViewport();

  if (narrow === null) return null;
  if (!narrow) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-bg px-8 text-center">
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute top-1/3 h-64 w-64 -translate-y-1/2 rounded-full opacity-20 blur-3xl"
        style={{ background: 'var(--color-accent)' }}
      />

      <div className="relative flex max-w-sm flex-col items-center gap-6">
        {/* Icon */}
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-surface">
          <Monitor className="h-8 w-8 text-accent" strokeWidth={1.5} />
        </div>

        {/* Wordmark */}
        <span className="font-logo text-lg font-medium tracking-wide text-fg">
          AutoDesigner
        </span>

        {/* Headline */}
        <h1 className="text-xl font-semibold leading-snug tracking-tight text-fg sm:text-2xl">
          Designed for larger screens
        </h1>

        {/* Explanation */}
        <p className="body-text max-w-xs leading-relaxed">
          AutoDesigner is a canvas workspace that needs room to
          breathe. Open it on a laptop or desktop for the full
          experience.
        </p>

        {/* Minimum spec */}
        <div className="ds-callout-note inline-flex items-center gap-2">
          <Monitor className="h-3.5 w-3.5 shrink-0 text-fg-muted" strokeWidth={1.5} />
          <span>
            Minimum width:&nbsp;
            <strong className="text-fg">{VIEWPORT_DESKTOP_MIN_WIDTH_PX}px</strong>
          </span>
        </div>
      </div>

      {/* Footer */}
      <p className="absolute bottom-6 text-nano text-fg-faint">
        A specification workspace for design exploration
      </p>
    </div>
  );
}
