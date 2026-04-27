import { AUTO_LAYOUT_DEBOUNCE_MS } from '../../lib/constants';

let dimensionLayoutTimer: ReturnType<typeof setTimeout> | null = null;

type CanvasGetter = () => { applyAutoLayout: () => void };

/** True when React Flow reported a dimensions change. */
export function shouldScheduleAutoLayoutOnDimensionChange(
  changes: Array<{ type?: string }>,
): boolean {
  return changes.some((c) => c.type === 'dimensions');
}

/** Debounced full auto-layout after node size changes (avoids feedback loops). */
export function scheduleDebouncedAutoLayout(get: CanvasGetter): void {
  if (dimensionLayoutTimer) clearTimeout(dimensionLayoutTimer);
  dimensionLayoutTimer = setTimeout(() => {
    dimensionLayoutTimer = null;
    get().applyAutoLayout();
  }, AUTO_LAYOUT_DEBOUNCE_MS);
}
