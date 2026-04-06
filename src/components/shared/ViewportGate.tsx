import { useState, useEffect } from 'react';
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
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-start bg-bg px-8 pt-[min(40vh,12rem)] sm:pt-[40vh]">
      <div className="flex w-full max-w-xs flex-col gap-4 text-left font-sans">
        <span className="font-logo text-nano font-medium uppercase tracking-widest text-fg-muted">
          AutoDesigner
        </span>
        <p className="text-base font-medium leading-snug text-fg sm:text-lg">Desktop only.</p>
        <p className="text-sm leading-relaxed text-fg-secondary">
          This is a canvas workspace that requires at least{' '}
          <span className="tabular-nums text-fg">{VIEWPORT_DESKTOP_MIN_WIDTH_PX}px</span> of
          viewport width.
        </p>
      </div>
    </div>
  );
}
