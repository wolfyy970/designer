import { afterEach, describe, expect, it, vi } from 'vitest';
import { bannerLine } from '../ui/format-helpers.ts';
import { BANNER_RULE_WIDTH } from '../ui/ui-constants.ts';

describe('bannerLine', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints a padded rule line including the message', () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((msg: unknown) => {
      lines.push(String(msg));
    });
    bannerLine('Meta-Harness', BANNER_RULE_WIDTH);
    spy.mockRestore();
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('Meta-Harness');
    expect(lines[0]?.startsWith('\n────')).toBe(true);
  });
});
