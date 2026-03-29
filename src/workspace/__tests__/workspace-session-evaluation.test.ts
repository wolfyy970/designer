import { describe, it, expect } from 'vitest';
import { evaluationPayloadFromHypothesisContext } from '../workspace-session';
import type { HypothesisGenerationContext } from '../workspace-session';
import type { VariantStrategy } from '../../types/compiler';
import type { DesignSpec } from '../../types/spec';

const baseStrategy = (dimensionValues: Record<string, string>): VariantStrategy => ({
  id: 'vs1',
  name: 'S',
  hypothesis: 'H',
  rationale: 'R',
  measurements: 'M',
  dimensionValues,
});

const baseSpec: DesignSpec = {
  id: 'spec1',
  title: 'T',
  sections: {
    'objectives-metrics': {
      id: 'objectives-metrics',
      content: 'Obj content',
      images: [],
      lastModified: '',
    },
    'design-constraints': {
      id: 'design-constraints',
      content: 'Constraint content',
      images: [],
      lastModified: '',
    },
  },
  createdAt: '',
  lastModified: '',
  version: 1,
};

function ctx(overrides: Partial<HypothesisGenerationContext>): HypothesisGenerationContext {
  return {
    hypothesisNodeId: 'h1',
    variantStrategy: baseStrategy({}),
    spec: baseSpec,
    agentMode: 'agentic',
    thinkingLevel: 'off',
    modelCredentials: [],
    designSystemContent: undefined,
    designSystemImages: [],
    ...overrides,
  };
}

describe('evaluationPayloadFromHypothesisContext', () => {
  it('returns undefined when not agentic', () => {
    expect(
      evaluationPayloadFromHypothesisContext(
        ctx({ agentMode: 'single', variantStrategy: baseStrategy({ format: 'html' }) }),
      ),
    ).toBeUndefined();
  });

  it('maps format dimension to outputFormat', () => {
    const p = evaluationPayloadFromHypothesisContext(
      ctx({ variantStrategy: baseStrategy({ format: 'html' }) }),
    );
    expect(p?.outputFormat).toBe('html');
    expect(p?.hypothesis).toBe('H');
    expect(p?.objectivesMetrics).toBe('Obj content');
    expect(p?.designConstraints).toBe('Constraint content');
  });

  it('accepts output_format and Output Format keys', () => {
    expect(
      evaluationPayloadFromHypothesisContext(
        ctx({ variantStrategy: baseStrategy({ output_format: 'react' }) }),
      )?.outputFormat,
    ).toBe('react');
    expect(
      evaluationPayloadFromHypothesisContext(
        ctx({ variantStrategy: baseStrategy({ 'Output Format': '  html  ' }) }),
      )?.outputFormat,
    ).toBe('html');
  });

  it('omits outputFormat when no format keys set', () => {
    const p = evaluationPayloadFromHypothesisContext(ctx({}));
    expect(p).toBeDefined();
    expect(p?.outputFormat).toBeUndefined();
  });
});
