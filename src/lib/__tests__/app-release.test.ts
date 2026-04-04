import { describe, it, expect } from 'vitest';
import { formatReleasedAtEastern, versionLabel, appReleaseLabel } from '../app-release';

describe('formatReleasedAtEastern', () => {
  it('returns empty for blank input', () => {
    expect(formatReleasedAtEastern('')).toBe('');
    expect(formatReleasedAtEastern('   ')).toBe('');
  });

  it('returns empty for invalid date', () => {
    expect(formatReleasedAtEastern('not-a-date')).toBe('');
  });

  it('shows America/New_York clock for a UTC summer instant (EDT)', () => {
    const s = formatReleasedAtEastern('2026-07-04T18:00:00.000Z');
    expect(s).toMatch(/Jul 4, 2026/);
    expect(s).toMatch(/2:00/);
    expect(s).toMatch(/EDT/);
  });

  it('shows America/New_York clock for a UTC winter instant (EST)', () => {
    const s = formatReleasedAtEastern('2026-01-04T18:00:00.000Z');
    expect(s).toMatch(/Jan 4, 2026/);
    expect(s).toMatch(/1:00/);
    expect(s).toMatch(/EST/);
  });
});

describe('release label helpers', () => {
  it('versionLabel prefixes v from injected package version', () => {
    expect(versionLabel()).toMatch(/^v[\d.]+$/);
  });

  it('appReleaseLabel includes version and Eastern formatted time', () => {
    const label = appReleaseLabel();
    expect(label).toContain('·');
    expect(label.startsWith('v')).toBe(true);
  });
});
