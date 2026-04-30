import { describe, it, expect } from 'vitest';
import { getSectionContent, collectImageLines } from '../prompts/helpers';
import type { DesignSpec, SpecSection, SpecSectionId } from '../../types/spec';

function makeSection(overrides: Partial<SpecSection> = {}): SpecSection {
  return {
    id: 'design-brief' as SpecSectionId,
    content: '',
    images: [],
    lastModified: new Date().toISOString(),
    ...overrides,
  };
}

function makeSpec(overrides: Partial<DesignSpec> = {}): DesignSpec {
  return {
    id: 'test-spec',
    title: 'Test',
    sections: {
      'design-brief': makeSection({ id: 'design-brief' }),
      'existing-design': makeSection({ id: 'existing-design' }),
      'research-context': makeSection({ id: 'research-context' }),
      'objectives-metrics': makeSection({ id: 'objectives-metrics' }),
      'design-constraints': makeSection({ id: 'design-constraints' }),
      'design-system': makeSection({ id: 'design-system' }),
    },
    createdAt: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    version: 1,
    ...overrides,
  };
}

// ─── getSectionContent ──────────────────────────────────────────────

describe('getSectionContent', () => {
  it('returns trimmed section content', () => {
    const spec = makeSpec({
      sections: {
        ...makeSpec().sections,
        'design-brief': makeSection({ id: 'design-brief', content: '  Hello world  ' }),
      },
    });
    expect(getSectionContent(spec, 'design-brief')).toBe('Hello world');
  });

  it('returns "(Not provided)" for empty content', () => {
    const spec = makeSpec();
    expect(getSectionContent(spec, 'design-brief')).toBe('(Not provided)');
  });

  it('returns "(Not provided)" for whitespace-only content', () => {
    const spec = makeSpec({
      sections: {
        ...makeSpec().sections,
        'design-brief': makeSection({ id: 'design-brief', content: '   \n\t  ' }),
      },
    });
    expect(getSectionContent(spec, 'design-brief')).toBe('(Not provided)');
  });

  it('returns "(Not provided)" for unknown section', () => {
    const spec = makeSpec();
    expect(getSectionContent(spec, 'nonexistent')).toBe('(Not provided)');
  });
});

// ─── collectImageLines ──────────────────────────────────────────────

describe('collectImageLines', () => {
  it('returns empty array when no images', () => {
    const spec = makeSpec();
    expect(collectImageLines(spec)).toEqual([]);
  });

  it('formats images with descriptions', () => {
    const spec = makeSpec({
      sections: {
        ...makeSpec().sections,
        'research-context': makeSection({
          id: 'research-context',
          images: [
            { id: 'img1', filename: 'photo.png', dataUrl: 'data:...', description: 'A screenshot', createdAt: '2024-01-01' },
          ],
        }),
      },
    });
    const lines = collectImageLines(spec);
    expect(lines).toEqual(['- [photo.png]: A screenshot']);
  });

  it('filters out images without descriptions', () => {
    const spec = makeSpec({
      sections: {
        ...makeSpec().sections,
        'research-context': makeSection({
          id: 'research-context',
          images: [
            { id: 'img1', filename: 'a.png', dataUrl: 'data:...', description: 'Has desc', createdAt: '2024-01-01' },
            { id: 'img2', filename: 'b.png', dataUrl: 'data:...', description: '', createdAt: '2024-01-01' },
            { id: 'img3', filename: 'c.png', dataUrl: 'data:...', description: '   ', createdAt: '2024-01-01' },
          ],
        }),
      },
    });
    const lines = collectImageLines(spec);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('a.png');
  });

  it('collects images from multiple sections', () => {
    const spec = makeSpec({
      sections: {
        ...makeSpec().sections,
        'design-brief': makeSection({
          id: 'design-brief',
          images: [
            { id: 'img1', filename: 'brief.png', dataUrl: 'data:...', description: 'Brief image', createdAt: '2024-01-01' },
          ],
        }),
        'objectives-metrics': makeSection({
          id: 'objectives-metrics',
          images: [
            { id: 'img2', filename: 'existing.png', dataUrl: 'data:...', description: 'Existing image', createdAt: '2024-01-01' },
          ],
        }),
      },
    });
    const lines = collectImageLines(spec);
    expect(lines).toHaveLength(2);
  });

  it('ignores retired legacy existing-design images', () => {
    const spec = makeSpec({
      sections: {
        ...makeSpec().sections,
        'existing-design': makeSection({
          id: 'existing-design',
          images: [
            { id: 'img1', filename: 'legacy.png', dataUrl: 'data:...', description: 'Legacy image', createdAt: '2024-01-01' },
          ],
        }),
      },
    });
    expect(collectImageLines(spec)).toEqual([]);
  });
});
