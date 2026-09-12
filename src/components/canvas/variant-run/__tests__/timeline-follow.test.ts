import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEAR_BOTTOM_PX,
  beginProgrammaticScroll,
  distanceFromBottom,
  isNearBottom,
  nextFollowState,
  shouldOfferJump,
} from '../timeline-follow';

/**
 * Regression coverage for the sticky-bottom latch. The previous implementation
 * wrote `followLatest = dist < NEAR_BOTTOM_PX` from *every* scroll event,
 * including the one caused by its own `scrollTop = scrollHeight`. When the
 * stream appended between that assignment and the event dispatch, the measured
 * distance exceeded the threshold, the timeline recorded "the viewer scrolled
 * away", and following latched off for the rest of the run.
 */

const bottom = { scrollTop: 1000, scrollHeight: 1400, clientHeight: 400 };
const nearBottom = { scrollTop: 980, scrollHeight: 1400, clientHeight: 400 };
const scrolledAway = { scrollTop: 200, scrollHeight: 1400, clientHeight: 400 };

/** Content grew by 300px after our scroll assignment, before the event landed. */
const staleAfterProgrammaticScroll = { scrollTop: 1000, scrollHeight: 1700, clientHeight: 400 };

describe('distanceFromBottom / isNearBottom', () => {
  it('measures the gap between the viewport bottom and the content end', () => {
    expect(distanceFromBottom(bottom)).toBe(0);
    expect(distanceFromBottom(scrolledAway)).toBe(800);
  });

  it('treats the threshold as inclusive', () => {
    const exactly = { scrollTop: 1000 - DEFAULT_NEAR_BOTTOM_PX, scrollHeight: 1400, clientHeight: 400 };
    expect(isNearBottom(exactly)).toBe(true);
    expect(isNearBottom({ ...exactly, scrollTop: exactly.scrollTop - 1 })).toBe(false);
  });
});

describe('nextFollowState', () => {
  it('does not un-pin on the timeline\'s own scroll, even when the measurement is stale', () => {
    expect(nextFollowState(true, true, staleAfterProgrammaticScroll)).toBe(true);
  });

  it('does not un-pin on a programmatic scroll while already unpinned', () => {
    expect(nextFollowState(false, true, scrolledAway)).toBe(false);
  });

  it('un-pins when the viewer scrolls away', () => {
    expect(nextFollowState(true, false, scrolledAway)).toBe(false);
  });

  it('re-arms once the viewer returns to the bottom', () => {
    expect(nextFollowState(false, false, nearBottom)).toBe(true);
  });

  it('stays pinned through repeated content appends that outrun the scroll', () => {
    // The reported symptom: streaming content grows, the follow effect scrolls,
    // and the follow flag must survive that exchange every time.
    let following = true;
    for (let i = 0; i < 5; i++) {
      following = nextFollowState(following, true, staleAfterProgrammaticScroll);
    }
    expect(following).toBe(true);
  });

  it('still un-pins after a real scroll that follows several programmatic ones', () => {
    let following = true;
    for (let i = 0; i < 3; i++) {
      following = nextFollowState(following, true, staleAfterProgrammaticScroll);
    }
    following = nextFollowState(following, false, scrolledAway);
    expect(following).toBe(false);
  });
});

describe('shouldOfferJump', () => {
  it('is offered only while streaming, unpinned, and away from the bottom', () => {
    expect(shouldOfferJump(false, true, scrolledAway)).toBe(true);
    expect(shouldOfferJump(true, true, scrolledAway)).toBe(false);
    expect(shouldOfferJump(false, false, scrolledAway)).toBe(false);
    expect(shouldOfferJump(false, true, nearBottom)).toBe(false);
  });
});

describe('beginProgrammaticScroll', () => {
  it('scrolls to the end of the content', () => {
    const el = { scrollTop: 0, scrollHeight: 1234 };
    beginProgrammaticScroll(el);
    expect(el.scrollTop).toBe(1234);
  });
});
