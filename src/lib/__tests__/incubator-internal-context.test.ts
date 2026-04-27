import { describe, it, expect } from 'vitest';
import type { DesignSpec, SpecSection, SpecSectionId } from '../../types/spec';
import { buildIncubatorUserPrompt, formatDesignSystemDocumentsBlock } from '../prompts/incubator-user';

function section(id: SpecSectionId, content = ''): SpecSection {
  return { id, content, images: [], lastModified: '2026-01-01T00:00:00Z' };
}

function spec(): DesignSpec {
  return {
    id: 's1',
    title: 'Spec',
    sections: {
      'design-brief': section('design-brief', 'Brief'),
      'existing-design': section('existing-design'),
      'research-context': section('research-context'),
      'objectives-metrics': section('objectives-metrics'),
      'design-constraints': section('design-constraints'),
      'design-system': section('design-system'),
    },
    createdAt: '2026-01-01T00:00:00Z',
    lastModified: '2026-01-01T00:00:00Z',
    version: 1,
  };
}

const template = 'Brief={{DESIGN_BRIEF}}{{INTERNAL_CONTEXT_DOCUMENT_BLOCK}}';

describe('incubator internal context prompt block', () => {
  it('includes the internal context document when supplied', () => {
    const out = buildIncubatorUserPrompt(spec(), template, undefined, {
      internalContextDocument: '# Internal\nUsers compare plans.',
    });
    expect(out).toContain('Internal Context Document');
    expect(out).toContain('Users compare plans.');
  });

  it('omits the internal context block when absent', () => {
    const out = buildIncubatorUserPrompt(spec(), template);
    expect(out).not.toContain('Internal Context Document');
  });
});

describe('incubator DESIGN.md prompt block', () => {
  it('includes design-system documents when supplied', () => {
    const out = formatDesignSystemDocumentsBlock([
      { nodeId: 'ds1', title: 'Brand DS', content: '# Brand\n\n## Color\nUse red.' },
    ]);
    expect(out).toContain('DESIGN.md Documents (optional visual-system context)');
    expect(out).toContain('Source: Brand DS (ds1)');
    expect(out).toContain('Use red.');
  });

  it('omits design-system documents when absent', () => {
    expect(formatDesignSystemDocumentsBlock()).toBe('');
    expect(formatDesignSystemDocumentsBlock([{ nodeId: 'ds1', title: 'Empty', content: '' }])).toBe('');
  });
});
