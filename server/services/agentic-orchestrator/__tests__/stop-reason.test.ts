import { describe, it, expect } from 'vitest';
import { decideStopReason } from '../stop-reason.ts';

describe('decideStopReason', () => {
  it('returns "aborted" when aborted, regardless of satisfaction', () => {
    expect(decideStopReason({ aborted: true, satisfied: true })).toBe('aborted');
    expect(decideStopReason({ aborted: true, satisfied: false })).toBe('aborted');
  });

  it('returns "satisfied" when not aborted and eval satisfied', () => {
    expect(decideStopReason({ aborted: false, satisfied: true })).toBe('satisfied');
  });

  it('returns "max_revisions" when not aborted and not satisfied', () => {
    expect(decideStopReason({ aborted: false, satisfied: false })).toBe('max_revisions');
  });
});
