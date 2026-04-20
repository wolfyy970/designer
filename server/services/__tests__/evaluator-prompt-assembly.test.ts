import { describe, it, expect } from 'vitest';
import { buildEvaluatorUserContent } from '../evaluator-prompt-assembly.ts';

describe('buildEvaluatorUserContent', () => {
  it('includes instruction, compiled prompt, file blocks, and structured context', () => {
    const files = { 'index.html': '<!DOCTYPE html><html><body>hi</body></html>' };
    const out = buildEvaluatorUserContent(files, 'Build a landing page', {
      strategyName: 'S',
      hypothesis: 'H',
      rationale: 'R',
      measurements: 'M',
      dimensionValues: { d1: 'v1' },
    });
    expect(out).toContain('<instruction>');
    expect(out).toContain('Build a landing page');
    expect(out).toContain('<strategy_name>');
    expect(out).toContain('S');
    expect(out).toContain('<hypothesis_bet>');
    expect(out).toContain('H');
    expect(out).toContain('<source_files>');
    expect(out).toContain('index.html');
    expect(out).toContain('<bundled_preview_html>');
  });

  it('includes preview_page_url when provided', () => {
    const out = buildEvaluatorUserContent({ 'a.html': '<html></html>' }, 'p', undefined, 'http://x/preview');
    expect(out).toContain('<preview_page_url>');
    expect(out).toContain('http://x/preview');
  });
});
