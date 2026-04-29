import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  scheduleCanvasFocusToNode,
  scheduleCanvasFitView,
  scheduleCanvasFitViewToNodes,
  SUBSET_FIT_VIEW_MAX_ZOOM,
  variantInspectorDockWidthPx,
  fitViewOptionsWithInspectorDock,
  VARIANT_INSPECTOR_MAX_WIDTH_PX,
} from '../canvas-fit-view';

describe('variantInspectorDockWidthPx', () => {
  it('caps at the same max as width.variant-inspector in tokens', () => {
    expect(variantInspectorDockWidthPx(2000)).toBe(VARIANT_INSPECTOR_MAX_WIDTH_PX);
  });

  it('uses the full pane width when below the cap', () => {
    expect(variantInspectorDockWidthPx(360)).toBe(360);
  });

  it('treats non-positive pane width as 0', () => {
    expect(variantInspectorDockWidthPx(-5)).toBe(0);
  });
});

describe('fitViewOptionsWithInspectorDock', () => {
  it('reserves dock width + gutter as px on the right (XYFlow parsePadding px branch)', () => {
    const opts = fitViewOptionsWithInspectorDock(2000);
    const p = opts.padding;
    expect(typeof p === 'object' && p != null && !Array.isArray(p)).toBe(true);
    if (typeof p === 'object' && p != null && 'right' in p) {
      expect(p.right).toBe(`${VARIANT_INSPECTOR_MAX_WIDTH_PX + 12}px`);
    }
  });
});

describe('scheduleCanvasFitView', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves a lazy options factory when the timer fires', () => {
    const fitView = vi.fn();
    const factory = vi.fn(() => ({ duration: 0, padding: 0.2 }));
    scheduleCanvasFitView(fitView, undefined, factory);
    expect(fitView).not.toHaveBeenCalled();
    expect(factory).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(fitView).toHaveBeenCalledWith({ duration: 0, padding: 0.2 });
  });
});

describe('scheduleCanvasFitViewToNodes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls fitView with deduped node ids and maxZoom after delay', () => {
    const fitView = vi.fn();
    scheduleCanvasFitViewToNodes(fitView, ['hyp-1', 'prev-a', 'hyp-1', '', 'prev-a']);
    expect(fitView).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(fitView).toHaveBeenCalledTimes(1);
    const arg = fitView.mock.calls[0][0];
    expect(arg?.maxZoom).toBe(SUBSET_FIT_VIEW_MAX_ZOOM);
    expect(arg?.nodes).toEqual([{ id: 'hyp-1' }, { id: 'prev-a' }]);
  });

  it('falls back to global fit when no valid ids', () => {
    const fitView = vi.fn();
    scheduleCanvasFitViewToNodes(fitView, []);
    vi.runAllTimers();
    expect(fitView).toHaveBeenCalledTimes(1);
    expect(fitView.mock.calls[0][0]).not.toHaveProperty('nodes');
  });
});

describe('scheduleCanvasFocusToNode', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('focuses a single node with the shared subset zoom cap', () => {
    const fitView = vi.fn();
    const afterFocus = vi.fn();
    scheduleCanvasFocusToNode(fitView, 'node-1', afterFocus);
    vi.runAllTimers();
    expect(fitView).toHaveBeenCalledTimes(1);
    expect(fitView.mock.calls[0][0]?.nodes).toEqual([{ id: 'node-1' }]);
    expect(fitView.mock.calls[0][0]?.maxZoom).toBe(SUBSET_FIT_VIEW_MAX_ZOOM);
    expect(afterFocus).toHaveBeenCalledTimes(1);
  });

  it('consumes an empty focus request without moving the viewport', () => {
    const fitView = vi.fn();
    const afterFocus = vi.fn();
    const timerId = scheduleCanvasFocusToNode(fitView, ' ', afterFocus);
    expect(timerId).toBeUndefined();
    expect(fitView).not.toHaveBeenCalled();
    expect(afterFocus).toHaveBeenCalledTimes(1);
  });

  it('consumes a missing-node focus request without moving the viewport', () => {
    const fitView = vi.fn();
    const afterFocus = vi.fn();
    scheduleCanvasFocusToNode(fitView, 'missing-node', afterFocus, () => false);
    vi.runAllTimers();
    expect(fitView).not.toHaveBeenCalled();
    expect(afterFocus).toHaveBeenCalledTimes(1);
  });
});
