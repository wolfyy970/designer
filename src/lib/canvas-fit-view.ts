import type { FitViewOptions } from '@xyflow/react';
import { FIT_VIEW_DELAY_MS, FIT_VIEW_DURATION_MS } from './constants';
import { NODE_TYPES } from '../constants/canvas';

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
export const NODE_FOCUS_MIN_ZOOM = 0.85;
export const STARTER_CANVAS_ZOOM = 1.25;
export const STARTER_CANVAS_MIN_ZOOM = 0.72;
export const STARTER_CANVAS_SCREEN_LEFT_PX = 180;
export const STARTER_CANVAS_SCREEN_TOP_PX = 72;
export const STARTER_CANVAS_SCREEN_RIGHT_PX = 96;
export const STARTER_CANVAS_SCREEN_BOTTOM_PX = 72;
export const STARTER_INCUBATOR_VISIBLE_WIDTH_PX = 320;

const STARTER_INPUT_NODE_TYPES = [
  NODE_TYPES.DESIGN_BRIEF,
  NODE_TYPES.DESIGN_SYSTEM,
] as const;

interface CanvasFitViewNode {
  id: string;
  type?: string | null;
  position: { x: number; y: number };
  measured?: { width?: number; height?: number };
  width?: number;
  height?: number;
}

interface CanvasViewportSize {
  width: number;
  height: number;
}

export function starterInputNodeIds(nodes: readonly CanvasFitViewNode[]): string[] {
  return STARTER_INPUT_NODE_TYPES.flatMap((type) => {
    const node = nodes.find((n) => n.type === type);
    return node ? [node.id] : [];
  });
}

function nodeWidth(node: CanvasFitViewNode): number {
  return node.measured?.width ?? node.width ?? 320;
}

function fallbackNodeHeight(node: CanvasFitViewNode): number {
  switch (node.type) {
    case NODE_TYPES.DESIGN_BRIEF:
      return 560;
    case NODE_TYPES.DESIGN_SYSTEM:
      return 220;
    case NODE_TYPES.INCUBATOR:
      return 280;
    default:
      return 200;
  }
}

function nodeHeight(node: CanvasFitViewNode): number {
  return node.measured?.height ?? node.height ?? fallbackNodeHeight(node);
}

function nodeBounds(node: CanvasFitViewNode): { x: number; y: number; width: number; height: number } {
  return {
    x: node.position.x,
    y: node.position.y,
    width: nodeWidth(node),
    height: nodeHeight(node),
  };
}

function mergeBounds(
  bounds: readonly { x: number; y: number; width: number; height: number }[],
): { x: number; y: number; width: number; height: number } {
  const left = Math.min(...bounds.map((b) => b.x));
  const top = Math.min(...bounds.map((b) => b.y));
  const right = Math.max(...bounds.map((b) => b.x + b.width));
  const bottom = Math.max(...bounds.map((b) => b.y + b.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function safePositive(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function starterCanvasCameraTarget(
  nodes: readonly CanvasFitViewNode[],
  viewport?: CanvasViewportSize,
): { x: number; y: number; zoom: number } | undefined {
  const brief = nodes.find((n) => n.type === NODE_TYPES.DESIGN_BRIEF);
  const designSystem = nodes.find((n) => n.type === NODE_TYPES.DESIGN_SYSTEM);
  const incubator = nodes.find((n) => n.type === NODE_TYPES.INCUBATOR);
  if (!brief || !designSystem || !incubator) return undefined;

  const inputBounds = mergeBounds([nodeBounds(brief), nodeBounds(designSystem)]);
  const viewportWidth = safePositive(viewport?.width);
  const viewportHeight = safePositive(viewport?.height);
  if (!viewportWidth || !viewportHeight) {
    return {
      x: inputBounds.x + inputBounds.width / 2,
      y: inputBounds.y + inputBounds.height / 2,
      zoom: STARTER_CANVAS_ZOOM,
    };
  }

  const availableWidth =
    viewportWidth - STARTER_CANVAS_SCREEN_LEFT_PX - STARTER_CANVAS_SCREEN_RIGHT_PX;
  const availableHeight =
    viewportHeight - STARTER_CANVAS_SCREEN_TOP_PX - STARTER_CANVAS_SCREEN_BOTTOM_PX;
  const inputZoomX = availableWidth / inputBounds.width;
  const inputZoomY = availableHeight / inputBounds.height;
  const incubatorRight =
    incubator.position.x + Math.min(nodeWidth(incubator), STARTER_INCUBATOR_VISIBLE_WIDTH_PX);
  const incubatorZoomX = availableWidth / Math.max(incubatorRight - inputBounds.x, inputBounds.width);
  const zoom = Math.max(
    STARTER_CANVAS_MIN_ZOOM,
    Math.min(STARTER_CANVAS_ZOOM, inputZoomX, inputZoomY, incubatorZoomX),
  );

  return {
    x: inputBounds.x + (viewportWidth / 2 - STARTER_CANVAS_SCREEN_LEFT_PX) / zoom,
    y: inputBounds.y + (viewportHeight / 2 - STARTER_CANVAS_SCREEN_TOP_PX) / zoom,
    zoom,
  };
}

type CanvasCameraCommand =
  | { type: 'fit-all'; options?: FitViewOptions }
  | { type: 'fit-nodes'; nodeIds: readonly string[]; options?: FitViewOptions }
  | { type: 'starter-canvas'; nodes: readonly CanvasFitViewNode[] }
  | { type: 'fit-with-inspector-dock'; flowPaneWidthPx: number }
  | {
      type: 'focus-node';
      nodeId: string | null | undefined;
      getNode: (nodeId: string) => CanvasFitViewNode | undefined;
      getZoom: () => number;
      zoom?: number;
    };

interface CanvasCameraRuntime {
  fitView: (options?: FitViewOptions) => void | Promise<boolean>;
  setCenter?: (x: number, y: number, options?: { zoom?: number; duration?: number }) => void;
  getViewportSize?: () => CanvasViewportSize;
}

export function scheduleCanvasCamera(
  runtime: CanvasCameraRuntime,
  command: CanvasCameraCommand,
  afterMove?: () => void,
): ReturnType<typeof setTimeout> | undefined {
  if (command.type === 'focus-node' && !command.nodeId?.trim()) {
    afterMove?.();
    return undefined;
  }

  return setTimeout(() => {
    runCanvasCamera(runtime, command);
    afterMove?.();
  }, FIT_VIEW_DELAY_MS);
}

function runCanvasCamera(runtime: CanvasCameraRuntime, command: CanvasCameraCommand): void {
  switch (command.type) {
    case 'fit-all':
      void runtime.fitView(command.options ?? { ...DEFAULT_FIT_VIEW_OPTIONS });
      return;
    case 'fit-nodes': {
      const unique = [...new Set(command.nodeIds.filter(Boolean))];
      if (unique.length === 0) {
        void runtime.fitView(command.options ?? { ...DEFAULT_FIT_VIEW_OPTIONS });
        return;
      }
      void runtime.fitView({
        ...DEFAULT_FIT_VIEW_OPTIONS,
        nodes: unique.map((id) => ({ id })),
        maxZoom: SUBSET_FIT_VIEW_MAX_ZOOM,
        ...command.options,
      });
      return;
    }
    case 'starter-canvas': {
      const target = starterCanvasCameraTarget(command.nodes, runtime.getViewportSize?.());
      if (!target || !runtime.setCenter) {
        void runtime.fitView({ ...DEFAULT_FIT_VIEW_OPTIONS });
        return;
      }
      runtime.setCenter(target.x, target.y, {
        zoom: target.zoom,
        duration: FIT_VIEW_DURATION_MS,
      });
      return;
    }
    case 'fit-with-inspector-dock':
      void runtime.fitView(fitViewOptionsWithInspectorDock(command.flowPaneWidthPx));
      return;
    case 'focus-node': {
      if (!runtime.setCenter) return;
      const id = command.nodeId?.trim();
      if (!id) return;
      const node = command.getNode(id);
      if (!node) return;
      const width = node.measured?.width ?? node.width ?? 320;
      const height = node.measured?.height ?? node.height ?? 200;
      runtime.setCenter(node.position.x + width / 2, node.position.y + height / 2, {
        zoom: command.zoom ?? Math.max(command.getZoom(), NODE_FOCUS_MIN_ZOOM),
        duration: FIT_VIEW_DURATION_MS,
      });
      return;
    }
  }
}

/**
 * Debounced `fitView` limited to the given node ids (hypothesis + preview lanes, etc.).
 * Reuses {@link FIT_VIEW_DELAY_MS}. If `nodeIds` is empty after dedupe, falls back to global
 * {@link scheduleCanvasFitView}.
 */
export function scheduleCanvasFitViewToNodes(
  fitView: (options?: FitViewOptions) => void | Promise<boolean>,
  nodeIds: readonly string[],
  afterFit?: () => void,
  options?: FitViewOptions,
): ReturnType<typeof setTimeout> {
  return scheduleCanvasCamera({ fitView }, { type: 'fit-nodes', nodeIds, options }, afterFit)!;
}

export function scheduleCanvasStarterView(
  runtime: CanvasCameraRuntime,
  nodes: readonly CanvasFitViewNode[],
  afterFit?: () => void,
): ReturnType<typeof setTimeout> | undefined {
  return scheduleCanvasCamera(runtime, { type: 'starter-canvas', nodes }, afterFit);
}

interface FocusableCanvasNode {
  id: string;
  position: { x: number; y: number };
  measured?: { width?: number; height?: number };
  width?: number;
  height?: number;
}

/**
 * Focus one node after layout settles by centering it, not fitting it. This keeps continuity
 * when optional inputs reorder: the viewport tracks the activated node instead of zooming out.
 */
export function scheduleCanvasFocusToNode(
  setCenter: (x: number, y: number, options?: { zoom?: number; duration?: number }) => void,
  nodeId: string | null | undefined,
  getNode: (nodeId: string) => FocusableCanvasNode | undefined,
  getZoom: () => number,
  afterFocus?: () => void,
  options?: { zoom?: number },
): ReturnType<typeof setTimeout> | undefined {
  return scheduleCanvasCamera(
    { fitView: () => undefined, setCenter },
    { type: 'focus-node', nodeId, getNode, getZoom, zoom: options?.zoom },
    afterFocus,
  );
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
    runCanvasCamera({ fitView }, { type: 'fit-all', options: resolved });
    afterFit?.();
  }, FIT_VIEW_DELAY_MS);
}

/** Toolbar / immediate fit with app-default duration and padding. */
export function fitViewWithDefaults(fitView: (options?: FitViewOptions) => void): void {
  runCanvasCamera({ fitView }, { type: 'fit-all' });
}
