import { describe, it, expect } from 'vitest';
import { compileVariantPrompts } from '../compiler';
import { PROMPT_DEFAULTS } from '../../lib/prompts/shared-defaults';
import type { DesignSpec, SpecSectionId, ReferenceImage } from '../../types/spec';
import type { DimensionMap, VariantStrategy } from '../../types/compiler';

const VARIANT_TEMPLATE = PROMPT_DEFAULTS['variant'];

function makeSection(id: SpecSectionId, content = '') {
  return {
    id,
    content,
    images: [] as ReferenceImage[],
    lastModified: '2024-01-01T00:00:00Z',
  };
}

function makeSpec(overrides: Partial<DesignSpec> = {}): DesignSpec {
  return {
    id: 'spec-1',
    title: 'Test Spec',
    sections: {
      'design-brief': makeSection('design-brief', 'A SaaS onboarding flow'),
      'existing-design': makeSection('existing-design'),
      'research-context': makeSection('research-context'),
      'objectives-metrics': makeSection('objectives-metrics'),
      'design-constraints': makeSection('design-constraints'),
      'design-system': makeSection('design-system'),
    },
    createdAt: '2024-01-01T00:00:00Z',
    lastModified: '2024-01-01T00:00:00Z',
    version: 1,
    ...overrides,
  };
}

function makeStrategy(overrides: Partial<VariantStrategy> = {}): VariantStrategy {
  return {
    id: 'strategy-1',
    name: 'Trust-Forward',
    hypothesis: 'Showing social proof early reduces bounce.',
    rationale: 'Users abandon due to trust concerns.',
    measurements: 'Bounce rate, conversion funnel completion.',
    dimensionValues: { layout: 'single-column', density: 'sparse' },
    ...overrides,
  };
}

function makeDimensionMap(variants: VariantStrategy[]): DimensionMap {
  return {
    id: 'dm-1',
    specId: 'spec-1',
    dimensions: [{ name: 'layout', range: 'single to multi-column', isConstant: false }],
    variants,
    generatedAt: '2024-01-01T00:00:00Z',
    compilerModel: 'gpt-4',
  };
}

describe('compileVariantPrompts', () => {
  it('returns one CompiledPrompt per variant strategy', () => {
    const spec = makeSpec();
    const strategies = [makeStrategy({ id: 's-1' }), makeStrategy({ id: 's-2' })];
    const dm = makeDimensionMap(strategies);

    const results = compileVariantPrompts(spec, dm, VARIANT_TEMPLATE);

    expect(results).toHaveLength(2);
  });

  it('maps variantStrategyId correctly', () => {
    const spec = makeSpec();
    const strategy = makeStrategy({ id: 'strategy-abc' });
    const dm = makeDimensionMap([strategy]);

    const [result] = compileVariantPrompts(spec, dm, VARIANT_TEMPLATE);

    expect(result.variantStrategyId).toBe('strategy-abc');
    expect(result.specId).toBe('spec-1');
  });

  it('each result has a unique id and a prompt string', () => {
    const spec = makeSpec();
    const dm = makeDimensionMap([makeStrategy({ id: 's-1' }), makeStrategy({ id: 's-2' })]);

    const results = compileVariantPrompts(spec, dm, VARIANT_TEMPLATE);

    expect(results[0].id).not.toBe(results[1].id);
    expect(typeof results[0].prompt).toBe('string');
    expect(results[0].prompt.length).toBeGreaterThan(0);
  });

  it('collects images from all spec sections', () => {
    const img: ReferenceImage = {
      id: 'img-1', filename: 'shot.png', dataUrl: 'data:image/png;base64,abc',
      description: 'A screenshot', createdAt: '2024-01-01T00:00:00Z',
    };
    const spec = makeSpec({
      sections: {
        'design-brief': { ...makeSection('design-brief'), images: [img] },
        'existing-design': makeSection('existing-design'),
        'research-context': makeSection('research-context'),
        'objectives-metrics': makeSection('objectives-metrics'),
        'design-constraints': makeSection('design-constraints'),
        'design-system': makeSection('design-system'),
      },
    });
    const dm = makeDimensionMap([makeStrategy()]);

    const [result] = compileVariantPrompts(spec, dm, VARIANT_TEMPLATE);

    expect(result.images).toHaveLength(1);
    expect(result.images[0].id).toBe('img-1');
  });

  it('merges extraImages with spec images', () => {
    const specImg: ReferenceImage = {
      id: 'spec-img', filename: 'spec.png', dataUrl: 'data:...', description: '', createdAt: '2024-01-01T00:00:00Z',
    };
    const extraImg: ReferenceImage = {
      id: 'extra-img', filename: 'design-system.png', dataUrl: 'data:...', description: '', createdAt: '2024-01-01T00:00:00Z',
    };
    const spec = makeSpec({
      sections: {
        'design-brief': { ...makeSection('design-brief'), images: [specImg] },
        'existing-design': makeSection('existing-design'),
        'research-context': makeSection('research-context'),
        'objectives-metrics': makeSection('objectives-metrics'),
        'design-constraints': makeSection('design-constraints'),
        'design-system': makeSection('design-system'),
      },
    });
    const dm = makeDimensionMap([makeStrategy()]);

    const [result] = compileVariantPrompts(spec, dm, VARIANT_TEMPLATE, undefined, [extraImg]);

    expect(result.images).toHaveLength(2);
    const ids = result.images.map((i) => i.id);
    expect(ids).toContain('spec-img');
    expect(ids).toContain('extra-img');
  });

  it('returns empty array when there are no variants', () => {
    const spec = makeSpec();
    const dm = makeDimensionMap([]);

    const results = compileVariantPrompts(spec, dm, VARIANT_TEMPLATE);

    expect(results).toHaveLength(0);
  });

  it('includes compiledAt timestamp string', () => {
    const spec = makeSpec();
    const dm = makeDimensionMap([makeStrategy()]);

    const [result] = compileVariantPrompts(spec, dm, VARIANT_TEMPLATE);

    expect(typeof result.compiledAt).toBe('string');
    expect(result.compiledAt.length).toBeGreaterThan(0);
  });
});
