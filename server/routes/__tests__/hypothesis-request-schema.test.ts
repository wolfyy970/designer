import { describe, expect, it } from 'vitest';
import { HypothesisWorkspaceCoreSchema } from '../../lib/hypothesis-schemas.ts';

function minimalValidSpec() {
  return {
    id: 'spec-1',
    title: 'T',
    sections: {},
    createdAt: '0',
    lastModified: '0',
    version: 1,
  };
}

function minimalCore(overrides: Record<string, unknown> = {}) {
  return {
    hypothesisNodeId: 'hyp-1',
    strategy: {
      id: 'v1',
      name: 'V',
      hypothesis: 'h',
      rationale: 'r',
      measurements: 'm',
      dimensionValues: {},
    },
    spec: minimalValidSpec(),
    snapshot: { nodes: [], edges: [] },
    domainHypothesis: null,
    modelProfiles: {
      m1: { nodeId: 'm1', providerId: 'openrouter', modelId: 'x' },
    },
    designSystems: {},
    defaultCompilerProvider: 'openrouter',
    ...overrides,
  };
}

describe('HypothesisWorkspaceCoreSchema', () => {
  it('accepts minimal valid body', () => {
    const r = HypothesisWorkspaceCoreSchema.safeParse(minimalCore());
    expect(r.success).toBe(true);
  });

  it('rejects invalid spec (missing title)', () => {
    const r = HypothesisWorkspaceCoreSchema.safeParse(
      minimalCore({
        spec: { id: 'spec-1', sections: {}, createdAt: '0', lastModified: '0', version: 1 },
      }),
    );
    expect(r.success).toBe(false);
  });

  it('rejects design system map with invalid image entry', () => {
    const r = HypothesisWorkspaceCoreSchema.safeParse(
      minimalCore({
        designSystems: {
          ds1: {
            nodeId: 'n1',
            title: 'DS',
            content: 'c',
            images: [{ id: 'i1' }],
          },
        },
      }),
    );
    expect(r.success).toBe(false);
  });

  it('accepts optional promptOverrides map', () => {
    const r = HypothesisWorkspaceCoreSchema.safeParse(
      minimalCore({
        promptOverrides: {
          'designer-hypothesis-inputs': 'local template',
          noiseKey: 'ignored server-side',
        },
      }),
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.promptOverrides?.['designer-hypothesis-inputs']).toBe('local template');
      expect(r.data.promptOverrides?.noiseKey).toBe('ignored server-side');
    }
  });
});
