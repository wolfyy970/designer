/** Minimum CSS width (px) for the full canvas workspace; below this the viewport gate is shown. */
export const VIEWPORT_DESKTOP_MIN_WIDTH_PX = 1024;

/** Media query matching viewports narrower than {@link VIEWPORT_DESKTOP_MIN_WIDTH_PX}. */
export function getViewportGateMediaQuery(): string {
  return `(max-width: ${VIEWPORT_DESKTOP_MIN_WIDTH_PX - 1}px)`;
}
