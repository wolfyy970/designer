import { describe, it, expect } from 'vitest';
import {
  VIEWPORT_DESKTOP_MIN_WIDTH_PX,
  getViewportGateMediaQuery,
} from '../viewport-gate';

describe('viewport-gate breakpoint', () => {
  it('pairs min width 1024 with max-width 1023 query (canonical laptop breakpoint)', () => {
    expect(VIEWPORT_DESKTOP_MIN_WIDTH_PX).toBe(1024);
    expect(getViewportGateMediaQuery()).toBe('(max-width: 1023px)');
  });
});
