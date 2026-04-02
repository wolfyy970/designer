import { AUTO_LAYOUT_DEBOUNCE_MS } from '../../lib/constants';

let dimensionLayoutTimer: ReturnType<typeof setTimeout> | null = null;

type CanvasGetter = () => { autoLayout: boolean; applyAutoLayout: () => void };

/** True when React Flow reported a dimensions change and auto-layout is on. */
export function shouldScheduleAutoLayoutOnDimensionChange(
  autoLayout: boolean,
  changes: Array<{ type?: string }>,
): boolean {
  return autoLayout && changes.some((c) => c.type === 'dimensions');
}

/** Debounced full auto-layout after node size changes (avoids feedback loops). */
export function scheduleDebouncedAutoLayout(get: CanvasGetter): void {
  if (dimensionLayoutTimer) clearTimeout(dimensionLayoutTimer);
  dimensionLayoutTimer = setTimeout(() => {
    dimensionLayoutTimer = null;
    if (get().autoLayout) get().applyAutoLayout();
  }, AUTO_LAYOUT_DEBOUNCE_MS);
}
