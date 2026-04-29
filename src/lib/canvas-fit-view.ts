import type { FitViewOptions } from '@xyflow/react';
import { FIT_VIEW_DELAY_MS, FIT_VIEW_DURATION_MS } from './constants';

const DEFAULT_FIT_PADDING = 0.15;

/**
 * Max width of the variant run inspector dock in px — the second argument of
 * `width.variant-inspector` in `packages/design-system/tokens.json`
 * (`min(100vw, 480px)`). Keep in sync when that token changes.
 */
export const VARIANT_INSPECTOR_MAX_WIDTH_PX = 480;

/** Breathing room beyond the dock so the rightmost node clears border/shadow. */
const INSPECTOR_DOCK_EDGE_GUTTER_PX = 12;

/** Resolved dock width in px (same rule as CSS `min(100vw, 480px)` on the pane). */
export function variantInspectorDockWidthPx(flowPaneWidthPx: number): number {
  const pane = Math.max(0, flowPaneWidthPx);
  return Math.min(pane, VARIANT_INSPECTOR_MAX_WIDTH_PX);
}

/**
 * fitView options that reserve the **pixel width** of the inspector overlay on the right.
 *
 * Important: XYFlow numeric padding is **not** “fraction of viewport”; it uses
 * `(viewport - viewport/(1+n))*0.5` per edge, so a number like `0.38` is far smaller than
 * a 480px dock. Use `NNpx` / `NN%` strings for the dock side (see `parsePadding` in `@xyflow/system`).
 */
export function fitViewOptionsWithInspectorDock(flowPaneWidthPx: number): FitViewOptions {
  const dockPx = variantInspectorDockWidthPx(flowPaneWidthPx);
  return {
    duration: FIT_VIEW_DURATION_MS,
    padding: {
      top: DEFAULT_FIT_PADDING,
      bottom: DEFAULT_FIT_PADDING,
      left: DEFAULT_FIT_PADDING,
      right: `${dockPx + INSPECTOR_DOCK_EDGE_GUTTER_PX}px`,
    },
  };
}

/** Shared options for post-layout / post-generation camera fit. */
export const DEFAULT_FIT_VIEW_OPTIONS = {
  duration: FIT_VIEW_DURATION_MS,
  padding: DEFAULT_FIT_PADDING,
} as const satisfies FitViewOptions;

/**
 * When fitting a tight subset of nodes (e.g. hypothesis + previews), XYFlow can pick a very
 * high zoom; cap so the graph stays readable.
 */
export const SUBSET_FIT_VIEW_MAX_ZOOM = 1.4;

/**
 * Debounced `fitView` limited to the given node ids (hypothesis + preview lanes, etc.).
 * Reuses {@link FIT_VIEW_DELAY_MS}. If `nodeIds` is empty after dedupe, falls back to global
 * {@link scheduleCanvasFitView}.
 */
export function scheduleCanvasFitViewToNodes(
  fitView: (options?: FitViewOptions) => void | Promise<boolean>,
  nodeIds: readonly string[],
  afterFit?: () => void,
): ReturnType<typeof setTimeout> {
  const unique = [...new Set(nodeIds.filter(Boolean))];
  if (unique.length === 0) {
    return scheduleCanvasFitView(fitView, afterFit);
  }
  return setTimeout(() => {
    void fitView({
      ...DEFAULT_FIT_VIEW_OPTIONS,
      nodes: unique.map((id) => ({ id })),
      maxZoom: SUBSET_FIT_VIEW_MAX_ZOOM,
    });
    afterFit?.();
  }, FIT_VIEW_DELAY_MS);
}

/**
 * Focus one node after layout settles. Missing/empty ids consume the request without moving
 * the viewport; callers can pass `hasNode` when the target may have been removed.
 */
export function scheduleCanvasFocusToNode(
  fitView: (options?: FitViewOptions) => void | Promise<boolean>,
  nodeId: string | null | undefined,
  afterFocus?: () => void,
  hasNode?: (nodeId: string) => boolean,
): ReturnType<typeof setTimeout> | undefined {
  const id = nodeId?.trim();
  if (!id) {
    afterFocus?.();
    return undefined;
  }
  return setTimeout(() => {
    if (hasNode?.(id) === false) {
      afterFocus?.();
      return;
    }
    void fitView({
      ...DEFAULT_FIT_VIEW_OPTIONS,
      nodes: [{ id }],
      maxZoom: SUBSET_FIT_VIEW_MAX_ZOOM,
    });
    afterFocus?.();
  }, FIT_VIEW_DELAY_MS);
}

export type ScheduleCanvasFitViewOptions = FitViewOptions | (() => FitViewOptions);

/**
 * Debounced fitView after layout/generation settles — shared timing across canvas surfaces.
 * @param afterFit optional hook (e.g. consume pending template flag) after fit runs.
 * @param options optional fitView options or a **lazy factory** (read pane size after the delay).
 */
export function scheduleCanvasFitView(
  fitView: (options?: FitViewOptions) => void,
  afterFit?: () => void,
  options?: ScheduleCanvasFitViewOptions,
): ReturnType<typeof setTimeout> {
  return setTimeout(() => {
    const resolved =
      options === undefined
        ? { ...DEFAULT_FIT_VIEW_OPTIONS }
        : typeof options === 'function'
          ? options()
          : { ...options };
    fitView(resolved);
    afterFit?.();
  }, FIT_VIEW_DELAY_MS);
}

/** Toolbar / immediate fit with app-default duration and padding. */
export function fitViewWithDefaults(fitView: (options?: FitViewOptions) => void): void {
  fitView({ ...DEFAULT_FIT_VIEW_OPTIONS });
}
