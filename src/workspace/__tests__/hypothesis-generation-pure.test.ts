import { describe, it, expect } from 'vitest';
import {
  buildHypothesisGenerationContextFromInputs,
  listIncomingModelCredentialsFromGraph,
  workspaceSnapshotWireToGraph,
} from '../hypothesis-generation-pure';
import type { VariantStrategy } from '../../types/compiler';
import type { DesignSpec } from '../../types/spec';
import { EDGE_STATUS, NODE_TYPES } from '../../constants/canvas';

const strategy: VariantStrategy = {
  id: 'vs1',
  name: 'S',
  hypothesis: 'H',
  rationale: 'R',
  measurements: '',
  dimensionValues: {},
};

const minimalSpec: DesignSpec = {
  id: 's',
  title: 't',
  sections: {},
  createdAt: '',
  lastModified: '',
  version: 1,
};

describe('hypothesis-generation-pure', () => {
  it('workspaceSnapshotWireToGraph passes nodes and edges through for graph helpers', () => {
    const wire = { nodes: [{ id: 'a' }], edges: [] };
    const g = workspaceSnapshotWireToGraph(wire);
    expect(g.nodes).toEqual(wire.nodes);
    expect(g.edges).toEqual([]);
  });

  it('listIncomingModelCredentialsFromGraph collects upstream model nodes', () => {
    const snapshot = {
      nodes: [
        {
          id: 'm1',
          type: NODE_TYPES.MODEL,
          position: { x: 0, y: 0 },
          data: { modelId: 'gpt-4', providerId: 'openrouter' },
        },
        {
          id: 'h1',
          type: NODE_TYPES.HYPOTHESIS,
          position: { x: 0, y: 0 },
          data: {},
        },
      ],
      edges: [
        {
          id: 'e1',
          source: 'm1',
          target: 'h1',
          type: 'dataFlow',
          data: { status: EDGE_STATUS.IDLE },
        },
      ],
    };
    expect(listIncomingModelCredentialsFromGraph('h1', snapshot, 'openrouter')).toEqual([
      { providerId: 'openrouter', modelId: 'gpt-4' },
    ]);
  });

  it('buildHypothesisGenerationContextFromInputs uses domain records when provided', () => {
    const ctx = buildHypothesisGenerationContextFromInputs({
      hypothesisNodeId: 'hyp1',
      variantStrategy: strategy,
      spec: minimalSpec,
      snapshot: { nodes: [], edges: [] },
      domainHypothesis: {
        id: 'hyp1',
        incubatorId: 'c1',
        variantStrategyId: 'vs1',
        modelNodeIds: ['mod1'],
        designSystemNodeIds: ['ds1'],
        agentMode: 'agentic',
        thinkingLevel: 'medium',
        placeholder: false,
      },
      modelProfiles: {
        mod1: { nodeId: 'mod1', providerId: 'openrouter', modelId: 'x' },
      },
      designSystems: {
        ds1: { nodeId: 'ds1', title: 'T', content: 'Body', images: [] },
      },
      defaultCompilerProvider: 'openrouter',
    });
    expect(ctx).not.toBeNull();
    expect(ctx!.agentMode).toBe('agentic');
    expect(ctx!.thinkingLevel).toBe('medium');
    expect(ctx!.modelCredentials).toEqual([{ providerId: 'openrouter', modelId: 'x' }]);
    expect(ctx!.designSystemContent).toContain('Body');
  });

  it('falls back to graph when domain lists no models', () => {
    const snapshot = {
      nodes: [
        {
          id: 'm1',
          type: NODE_TYPES.MODEL,
          position: { x: 0, y: 0 },
          data: { modelId: 'lm', providerId: 'lmstudio' },
        },
        {
          id: 'h1',
          type: NODE_TYPES.HYPOTHESIS,
          position: { x: 0, y: 0 },
          data: { agentMode: 'single' },
        },
      ],
      edges: [
        {
          id: 'e1',
          source: 'm1',
          target: 'h1',
          type: 'dataFlow',
          data: { status: EDGE_STATUS.IDLE },
        },
      ],
    };
    const ctx = buildHypothesisGenerationContextFromInputs({
      hypothesisNodeId: 'h1',
      variantStrategy: strategy,
      spec: minimalSpec,
      snapshot,
      domainHypothesis: {
        id: 'h1',
        incubatorId: 'c1',
        variantStrategyId: 'vs1',
        modelNodeIds: [],
        designSystemNodeIds: [],
        agentMode: 'agentic',
        thinkingLevel: undefined,
        placeholder: false,
      },
      modelProfiles: {},
      designSystems: {},
      defaultCompilerProvider: 'openrouter',
    });
    expect(ctx).not.toBeNull();
    expect(ctx!.modelCredentials).toEqual([{ providerId: 'lmstudio', modelId: 'lm' }]);
  });
});
