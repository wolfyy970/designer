import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('document metadata', () => {
  it('uses Designer as the browser title', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

    expect(html).toContain('<title>Designer</title>');
    expect(html).not.toContain(`<title>${'Auto'} ${'Designer'}</title>`);
  });
});
