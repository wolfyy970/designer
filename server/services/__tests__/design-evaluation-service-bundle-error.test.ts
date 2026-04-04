import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../../src/lib/bundle-virtual-fs.ts', () => ({
  bundleVirtualFS: vi.fn(() => {
    throw new Error('forced bundle failure');
  }),
}));

import { buildEvaluatorUserContent } from '../design-evaluation-service.ts';

describe('buildEvaluatorUserContent', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('surfaces normalized error in bundled HTML when bundleVirtualFS throws', () => {
    const out = buildEvaluatorUserContent(
      { 'index.html': '<!DOCTYPE html><html><body>x</body></html>' },
      'compiled prompt',
    );
    expect(out).toContain('forced bundle failure');
    expect(out).toContain('[bundle error]');
    expect(out).toContain('bundleVirtualFS failed');
  });
});
