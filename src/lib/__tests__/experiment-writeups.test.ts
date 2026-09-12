import { describe, expect, it } from 'vitest';
import {
  EXPERIMENT_PERIOD_LABEL,
  EXPERIMENT_WRITE_UPS,
} from '../experiment-writeups';

describe('experiment write-ups', () => {
  it('lists both published parts, in reading order', () => {
    expect(EXPERIMENT_WRITE_UPS.map((p) => p.id)).toEqual(['part-1', 'part-2']);
  });

  it('points at the real Substack posts', () => {
    expect(EXPERIMENT_WRITE_UPS.map((p) => p.href)).toEqual([
      'https://kcwolfy.substack.com/p/the-designer-experiment-part-1?r=mxsut',
      'https://kcwolfy.substack.com/p/the-designer-experiment-part-two?r=mxsut',
    ]);
  });

  it('keeps the Substack referral parameter on every link', () => {
    // Easy to lose in a copy-paste edit, and it is the attribution link.
    for (const post of EXPERIMENT_WRITE_UPS) {
      expect(post.href, post.id).toContain('r=mxsut');
      expect(post.href, post.id).toMatch(/^https:\/\/kcwolfy\.substack\.com\//);
    }
  });

  it('gives every entry a label and a blurb', () => {
    for (const post of EXPERIMENT_WRITE_UPS) {
      expect(post.label.trim().length, post.id).toBeGreaterThan(0);
      expect(post.blurb.trim().length, post.id).toBeGreaterThan(0);
    }
  });

  it('states the period the experiment was run', () => {
    // The whole point of the date is that it is stated, not implied.
    expect(EXPERIMENT_PERIOD_LABEL).toBe('June 2026');
  });
});
