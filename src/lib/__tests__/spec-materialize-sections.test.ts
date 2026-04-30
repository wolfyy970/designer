import { describe, it, expect } from 'vitest';
import type { DesignSpec, SpecSectionId } from '../../types/spec';
import { optionalInputSlotsWithSpecMaterial } from '../spec-materialize-sections';

function emptySection(id: SpecSectionId) {
  return { id, content: '', images: [], lastModified: '2024-01-01' };
}

function minimalSpec(sections: Partial<Record<SpecSectionId, { content?: string }>>): DesignSpec {
  const base: DesignSpec['sections'] = {
    'design-brief': emptySection('design-brief'),
    'existing-design': emptySection('existing-design'),
    'research-context': emptySection('research-context'),
    'objectives-metrics': emptySection('objectives-metrics'),
    'design-constraints': emptySection('design-constraints'),
    'design-system': emptySection('design-system'),
  };
  for (const [k, v] of Object.entries(sections)) {
    const id = k as SpecSectionId;
    base[id] = { ...base[id], content: v?.content ?? '', images: [], lastModified: '2024-01-01' };
  }
  return {
    id: 's1',
    title: 'T',
    createdAt: '2024-01-01',
    lastModified: '2024-01-01',
    version: 1,
    sections: base,
  };
}

describe('optionalInputSlotsWithSpecMaterial', () => {
  it('returns empty when all optional facets are blank', () => {
    expect(optionalInputSlotsWithSpecMaterial(minimalSpec({}))).toEqual([]);
  });

  it('includes slots with non-whitespace content', () => {
    const spec = minimalSpec({ 'research-context': { content: 'Notes' } });
    expect(optionalInputSlotsWithSpecMaterial(spec)).toEqual(['researchContext']);
  });

  it('includes multiple slots in OPTIONAL_INPUT_SLOTS order', () => {
    const spec = minimalSpec({
      'research-context': { content: 'y' },
      'objectives-metrics': { content: 'x' },
      'design-system': { content: 'z' },
    });
    expect(optionalInputSlotsWithSpecMaterial(spec)).toEqual(['researchContext', 'objectivesMetrics']);
  });

  it('does not materialize design-system as an optional ghost slot', () => {
    const spec = minimalSpec({});
    spec.sections['design-system'] = {
      ...spec.sections['design-system'],
      content: '',
      images: [{ id: 'i1', filename: 'x.png', dataUrl: 'data:', description: '', createdAt: '2024-01-01' }],
    };
    expect(optionalInputSlotsWithSpecMaterial(spec)).toEqual([]);
  });

  it('ignores retired legacy existing-design material', () => {
    const spec = minimalSpec({ 'existing-design': { content: 'Legacy' } });
    expect(optionalInputSlotsWithSpecMaterial(spec)).toEqual([]);
  });
});
