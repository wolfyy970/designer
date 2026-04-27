import { describe, it, expect } from 'vitest';
import { DesignSpecSchema } from '../spec';

const baseSpec = {
  id: 's1',
  title: 'Spec',
  sections: {
    'design-brief': {
      id: 'design-brief',
      content: 'Brief',
      images: [],
      lastModified: '2026-01-01T00:00:00Z',
    },
  },
  createdAt: '2026-01-01T00:00:00Z',
  lastModified: '2026-01-01T00:00:00Z',
  version: 1,
};

describe('DesignSpecSchema internalContextDocument', () => {
  it('accepts legacy specs without an internal context document', () => {
    expect(DesignSpecSchema.safeParse(baseSpec).success).toBe(true);
  });

  it('accepts specs with an internal context document', () => {
    const result = DesignSpecSchema.safeParse({
      ...baseSpec,
      internalContextDocument: {
        content: '# Context',
        sourceHash: 'fnv1a:abc',
        generatedAt: '2026-01-02T00:00:00Z',
        providerId: 'openrouter',
        modelId: 'model',
      },
    });
    expect(result.success).toBe(true);
  });
});
