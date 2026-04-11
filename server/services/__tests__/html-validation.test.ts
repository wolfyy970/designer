import { describe, it, expect } from 'vitest';
import { validateHtmlWorkspaceContent } from '../html-validation.ts';

const minimalValidHtml = `<!DOCTYPE html>
<html><head><title>x</title></head><body><p>hi</p></body></html>`;

describe('validateHtmlWorkspaceContent', () => {
  it('returns no issues for minimal valid HTML', async () => {
    const issues = await validateHtmlWorkspaceContent(minimalValidHtml, 'index.html', async () => true);
    expect(issues).toEqual([]);
  });

  it('flags missing DOCTYPE', async () => {
    const issues = await validateHtmlWorkspaceContent('<html><head></head><body></body></html>', 'x.html', async () => true);
    expect(issues.some((i) => i.includes('DOCTYPE'))).toBe(true);
  });

  it('flags missing asset when checker returns false', async () => {
    const html = `<!DOCTYPE html>
<html><head><link rel="stylesheet" href="missing.css"/></head><body></body></html>`;
    const issues = await validateHtmlWorkspaceContent(html, 'index.html', async () => false);
    expect(issues.some((i) => i.includes('Referenced asset not found'))).toBe(true);
  });
});
