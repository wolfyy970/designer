import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg px-6 py-10">
      <div className="flex w-full max-w-sm flex-col rounded-md border border-border bg-surface-raised p-6 text-left font-sans shadow-sm">
        <span className="shrink-0 font-logo text-lg font-medium leading-none tracking-wide text-fg">
          Designer
        </span>
        <p className="mt-8 text-2xl font-medium leading-tight text-fg">Desktop only.</p>
        <p className="mt-4 text-sm leading-relaxed text-fg-secondary">
          The canvas needs a wider screen to show the workspace. Use a viewport at least{' '}
          <span className="tabular-nums text-fg">{VIEWPORT_DESKTOP_MIN_WIDTH_PX}px</span> wide.
        </p>
        <Link
          to="/"
          className="mt-8 inline-flex w-fit items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-contrast hover:bg-accent-hover"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
