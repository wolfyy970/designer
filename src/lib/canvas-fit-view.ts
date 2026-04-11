import type { FitViewOptions } from '@xyflow/react';
import { FIT_VIEW_DELAY_MS, FIT_VIEW_DURATION_MS } from './constants';

const DEFAULT_FIT_PADDING = 0.15;

/** Shared options for post-layout / post-generation camera fit. */
export const DEFAULT_FIT_VIEW_OPTIONS = {
  duration: FIT_VIEW_DURATION_MS,
  padding: DEFAULT_FIT_PADDING,
} as const satisfies FitViewOptions;

/**
 * Debounced fitView after layout/generation settles — shared timing across canvas surfaces.
 * @param afterFit optional hook (e.g. consume pending template flag) after fit runs.
 */
export function scheduleCanvasFitView(
  fitView: (options?: FitViewOptions) => void,
  afterFit?: () => void,
): ReturnType<typeof setTimeout> {
  return setTimeout(() => {
    fitView({ ...DEFAULT_FIT_VIEW_OPTIONS });
    afterFit?.();
  }, FIT_VIEW_DELAY_MS);
}

/** Toolbar / immediate fit with app-default duration and padding. */
export function fitViewWithDefaults(fitView: (options?: FitViewOptions) => void): void {
  fitView({ ...DEFAULT_FIT_VIEW_OPTIONS });
}
