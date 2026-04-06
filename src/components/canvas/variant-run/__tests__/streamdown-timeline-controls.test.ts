import { describe, expect, it } from 'vitest';
import { resolveStreamdownTimelineControls } from '../streamdown-timeline-controls';

describe('resolveStreamdownTimelineControls', () => {
  it('disables Streamdown table chrome when controls are omitted', () => {
    expect(resolveStreamdownTimelineControls(undefined)).toEqual({ table: false });
  });

  it('passes through an explicit controls value', () => {
    expect(resolveStreamdownTimelineControls(false)).toBe(false);
    expect(resolveStreamdownTimelineControls({ table: true })).toEqual({ table: true });
    expect(
      resolveStreamdownTimelineControls({
        code: false,
        table: { copy: true, download: false, fullscreen: false },
      }),
    ).toEqual({
      code: false,
      table: { copy: true, download: false, fullscreen: false },
    });
  });
});
