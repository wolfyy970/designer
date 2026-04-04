import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkspaceDomainStore } from '../../stores/workspace-domain-store';
import { buildHypothesisGenerationContext } from '../workspace-session';
import type { HypothesisStrategy } from '../../types/compiler';
import type { DesignSpec } from '../../types/spec';

const strategy: HypothesisStrategy = {
  id: 'vs1',
  name: 'S',
  hypothesis: 'H',
  rationale: 'R',
  measurements: '',
  dimensionValues: {},
};

describe('buildHypothesisGenerationContext (domain)', () => {
  beforeEach(() => {
    useWorkspaceDomainStore.getState().reset();
  });

  it('uses domain model + design system when hypothesis is registered', () => {
    useWorkspaceDomainStore.setState({
      hypotheses: {
        hyp1: {
          id: 'hyp1',
          incubatorId: 'c1',
          strategyId: 'vs1',
          modelNodeIds: ['mod1'],
          designSystemNodeIds: ['ds1'],
          agentMode: 'agentic',
          placeholder: false,
        },
      },
      modelProfiles: {
        mod1: { nodeId: 'mod1', providerId: 'openrouter', modelId: 'gpt-4', thinkingLevel: 'low' },
      },
      designSystems: {
        ds1: {
          nodeId: 'ds1',
          title: 'DS',
          content: 'Hello',
          images: [],
        },
      },
    });

    const spec: DesignSpec = {
      id: 's',
      title: 't',
      sections: {},
      createdAt: '',
      lastModified: '',
      version: 1,
    };

    const ctx = buildHypothesisGenerationContext({
      hypothesisNodeId: 'hyp1',
      hypothesisStrategy: strategy,
      snapshot: { nodes: [], edges: [] },
      spec,
    });

    expect(ctx).not.toBeNull();
    expect(ctx!.agentMode).toBe('agentic');
    expect(ctx!.modelCredentials).toEqual([
      { providerId: 'openrouter', modelId: 'gpt-4', thinkingLevel: 'low' },
    ]);
    expect(ctx!.designSystemContent).toContain('Hello');
  });
});
