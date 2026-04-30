import { describe, it, expect } from 'vitest';
import type { ReferenceImage } from '../../types/spec';
import {
  computeDesignMdSourceHash,
  designMdSourceHasInput,
  formatDesignSystemSourceMarkdown,
  getDesignMdStatus,
  isDesignMdDocumentStale,
} from '../design-md';

const image: ReferenceImage = {
  id: 'img1',
  filename: 'screen.png',
  dataUrl: 'data:image/png;base64,aaa',
  description: 'Primary screen',
  createdAt: '2026-01-01T00:00:00Z',
};

describe('DESIGN.md helpers', () => {
  it('changes source hash for source text and images', () => {
    const a = computeDesignMdSourceHash({ title: 'DS', content: 'Tokens', images: [image] });
    const b = computeDesignMdSourceHash({ title: 'DS', content: 'Different tokens', images: [image] });
    const c = computeDesignMdSourceHash({
      title: 'DS',
      content: 'Tokens',
      images: [{ ...image, dataUrl: 'data:image/png;base64,bbb' }],
    });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it('changes source hash for uploaded Markdown source content', () => {
    const base = {
      title: 'DS',
      content: '',
      markdownSources: [
        {
          id: 'md1',
          filename: 'DESIGN.md',
          content: '# Brand',
          sizeBytes: 7,
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
    };
    const a = computeDesignMdSourceHash(base);
    const b = computeDesignMdSourceHash({
      ...base,
      markdownSources: [{ ...base.markdownSources[0], content: '# Changed brand' }],
    });
    expect(a).not.toBe(b);
  });

  it('treats Markdown-only design-system source as valid input', () => {
    expect(designMdSourceHasInput({
      markdownSources: [
        {
          id: 'md1',
          filename: 'tokens.md',
          content: '# Tokens',
          sizeBytes: 8,
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
    })).toBe(true);
  });

  it('formats raw design-system fallback from text and Markdown sources', () => {
    expect(formatDesignSystemSourceMarkdown({
      content: 'Brand notes',
      markdownSources: [
        {
          id: 'md1',
          filename: 'DESIGN.md',
          content: '# Tokens',
          sizeBytes: 8,
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
    })).toContain('## Markdown source: DESIGN.md\n# Tokens');
  });

  it('is stable for unrelated generated-document fields', () => {
    const source = { title: 'DS', content: 'Tokens', images: [image] };
    const sourceHash = computeDesignMdSourceHash(source);
    expect(
      isDesignMdDocumentStale(source, {
        content: '# DS',
        sourceHash,
        generatedAt: '2026-01-01T00:00:00Z',
        providerId: 'p',
        modelId: 'm',
      }),
    ).toBe(false);
  });

  it('returns status states', () => {
    const source = { content: 'Tokens' };
    const sourceHash = computeDesignMdSourceHash(source);
    expect(getDesignMdStatus(source, false)).toBe('missing');
    expect(getDesignMdStatus(source, true)).toBe('generating');
    expect(getDesignMdStatus(source, false, {
      content: '# DS',
      sourceHash: 'old',
      generatedAt: '2026-01-01T00:00:00Z',
      providerId: 'p',
      modelId: 'm',
    })).toBe('stale');
    expect(getDesignMdStatus(source, false, {
      content: '# DS',
      sourceHash,
      generatedAt: '2026-01-01T00:00:00Z',
      providerId: 'p',
      modelId: 'm',
      error: 'failed',
    })).toBe('error');
  });
});
