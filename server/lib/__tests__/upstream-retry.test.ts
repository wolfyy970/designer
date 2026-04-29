import { describe, it, expect } from 'vitest';
import { isAppRetryableUpstreamError } from '../upstream-retry.ts';

describe('isAppRetryableUpstreamError', () => {
  it('matches Friendli-style upstream NaN errors', () => {
    expect(
      isAppRetryableUpstreamError('Upstream error from Friendli: NaN error'),
    ).toBe(true);
  });

  it('matches generic upstream and gateway strings', () => {
    expect(isAppRetryableUpstreamError('upstream connect failed')).toBe(true);
    expect(isAppRetryableUpstreamError('Gateway timeout')).toBe(true);
    expect(isAppRetryableUpstreamError('provider returned error')).toBe(true);
  });

  it('matches 5xx hints', () => {
    expect(isAppRetryableUpstreamError('HTTP 502 bad gateway')).toBe(true);
  });

  it('returns false for empty or unrelated messages', () => {
    expect(isAppRetryableUpstreamError(undefined)).toBe(false);
    expect(isAppRetryableUpstreamError('')).toBe(false);
    expect(isAppRetryableUpstreamError('validation failed')).toBe(false);
  });

  it('does not retry credit exhaustion errors', () => {
    expect(isAppRetryableUpstreamError('OpenRouter API error (402): insufficient credits')).toBe(false);
    expect(isAppRetryableUpstreamError('OpenRouter credits are exhausted')).toBe(false);
  });
});
