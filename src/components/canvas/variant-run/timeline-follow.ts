/**
 * Sticky-bottom follow state for the watch-mode timeline.
 *
 * The old implementation kept a single `followLatest` boolean and wrote it from
 * the scroll handler:
 *
 *     followLatestRef.current = dist < NEAR_BOTTOM_PX
 *
 * That looks harmless but latches *off* on the component's own scrolls. Assigning
 * `el.scrollTop = el.scrollHeight` makes the browser emit a `scroll` event; if the
 * stream appended anything between that assignment and the event dispatch (it
 * usually has — that is why we are scrolling), the measured distance is larger
 * than the threshold, the handler records "the user scrolled away", and the follow
 * effect returns early forever after. The viewer is stranded mid-stream and has to
 * drag the scrollbar down, at which point new content pushes them off again.
 *
 * The fix is to stop inferring intent from scroll *position* on every scroll
 * event: a programmatic scroll never changes whether we are keeping up, and the
 * position a programmatic scroll lands on is allowed to be briefly stale. Only a
 * scroll the component did not initiate may unpin.
 */

export const DEFAULT_NEAR_BOTTOM_PX = 48;

export interface ScrollPosition {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/** Distance in px between the viewport's bottom edge and the content's end. */
export function distanceFromBottom(pos: ScrollPosition): number {
  return pos.scrollHeight - pos.scrollTop - pos.clientHeight;
}

export function isNearBottom(
  pos: ScrollPosition,
  thresholdPx: number = DEFAULT_NEAR_BOTTOM_PX,
): boolean {
  return distanceFromBottom(pos) <= thresholdPx;
}

/**
 * Next follow state after a scroll event, from one of two sources.
 *
 * A **programmatic** scroll is the timeline putting itself at the newest content.
 * It cannot express intent, and while the stream is growing its measured distance
 * is stale, so it never changes the state — re-measuring there is exactly the bug
 * this module exists to prevent.
 *
 * Any **other** scroll is the viewer driving the viewport (or a layout settle the
 * viewer caused), so its measured distance is the truth: at the bottom keeps or
 * restores following, away from the bottom releases it. Releasing is essential —
 * without it the timeline would keep yanking a reader back to the newest output
 * every time the model emitted a token.
 */
export function nextFollowState(
  following: boolean,
  fromProgrammatic: boolean,
  pos: ScrollPosition,
  thresholdPx: number = DEFAULT_NEAR_BOTTOM_PX,
): boolean {
  if (fromProgrammatic) return following;
  return isNearBottom(pos, thresholdPx);
}

/**
 * Whether the "jump to latest" affordance should be offered: only while the run
 * is streaming and the viewer has deliberately moved away from the bottom.
 */
export function shouldOfferJump(
  following: boolean,
  isStreaming: boolean,
  pos: ScrollPosition,
  thresholdPx: number = DEFAULT_NEAR_BOTTOM_PX,
): boolean {
  return isStreaming && !following && !isNearBottom(pos, thresholdPx);
}

/**
 * Scroll to the bottom and report that the next `scroll` event is ours.
 *
 * Deliberately synchronous: the flag is read by the `scroll` handler, which the
 * browser dispatches as a separate task, so it survives until that handler runs.
 * The caller clears it in a microtask (immediately after layout effects), which
 * is before any real user scroll can be queued.
 */
export function beginProgrammaticScroll(el: { scrollTop: number; scrollHeight: number }): void {
  el.scrollTop = el.scrollHeight;
}
