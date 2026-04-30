import { describe, it, expect } from 'vitest';
import {
  buildHypothesisGenerationContextFromInputs,
  listIncomingModelCredentialsFromGraph,
  normalizeModelProfilesForApi,
  workspaceSnapshotWireToGraph,
} from '../hypothesis-generation-pure';
import type { HypothesisStrategy } from '../../types/incubator';
import type { DesignSpec } from '../../types/spec';
import { EDGE_STATUS, NODE_TYPES } from '../../constants/canvas';
import { LOCKDOWN_MODEL_ID, LOCKDOWN_PROVIDER_ID } from '../../lib/lockdown-model';

const strategy: HypothesisStrategy = {
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

describe('normalizeModelProfilesForApi', () => {
  it('coerces undefined providerId/modelId so API Zod accepts the record', () => {
    const raw = {
      m1: {
        nodeId: 'm1',
        providerId: 'openrouter',
        modelId: 'ok',
      },
      ghost: {
        nodeId: undefined as unknown as string,
        providerId: undefined as unknown as string,
        modelId: undefined as unknown as string,
      },
    };
    const n = normalizeModelProfilesForApi(raw, 'default-provider');
    expect(n.m1).toEqual({
      nodeId: 'm1',
      providerId: 'openrouter',
      modelId: 'ok',
    });
    expect(n.ghost).toEqual({
      nodeId: 'ghost',
      providerId: 'default-provider',
      modelId: '',
    });
  });

  it('drops invalid thinkingLevel and keeps valid ones', () => {
    const n = normalizeModelProfilesForApi(
      {
        a: {
          nodeId: 'a',
          providerId: 'p',
          modelId: 'm',
          thinkingLevel: 'nope' as never,
        },
        b: {
          nodeId: 'b',
          providerId: 'p',
          modelId: 'm',
          thinkingLevel: 'high',
        },
      },
      'p',
    );
    expect(n.a.thinkingLevel).toBeUndefined();
    expect(n.b.thinkingLevel).toBe('high');
  });

  it('overwrites provider and model when lockdown is true', () => {
    const n = normalizeModelProfilesForApi(
      {
        m1: { nodeId: 'm1', providerId: 'lmstudio', modelId: 'local' },
      },
      'default-provider',
      true,
    );
    expect(n.m1?.providerId).toBe(LOCKDOWN_PROVIDER_ID);
    expect(n.m1?.modelId).toBe(LOCKDOWN_MODEL_ID);
  });
});

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
      { providerId: 'openrouter', modelId: 'gpt-4', thinkingLevel: 'minimal' },
    ]);
  });

  it('listIncomingModelCredentialsFromGraph uses only the first model edge when several exist', () => {
    const snapshot = {
      nodes: [
        {
          id: 'm1',
          type: NODE_TYPES.MODEL,
          position: { x: 0, y: 0 },
          data: { modelId: 'first', providerId: 'openrouter' },
        },
        {
          id: 'm2',
          type: NODE_TYPES.MODEL,
          position: { x: 0, y: 0 },
          data: { modelId: 'second', providerId: 'openrouter' },
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
        {
          id: 'e2',
          source: 'm2',
          target: 'h1',
          type: 'dataFlow',
          data: { status: EDGE_STATUS.IDLE },
        },
      ],
    };
    expect(listIncomingModelCredentialsFromGraph('h1', snapshot, 'openrouter')).toEqual([
      { providerId: 'openrouter', modelId: 'first', thinkingLevel: 'minimal' },
    ]);
  });

  it('buildHypothesisGenerationContextFromInputs uses domain records when provided', () => {
    const ctx = buildHypothesisGenerationContextFromInputs({
      hypothesisNodeId: 'hyp1',
      hypothesisStrategy: strategy,
      spec: minimalSpec,
      snapshot: { nodes: [], edges: [] },
      domainHypothesis: {
        id: 'hyp1',
        incubatorId: 'c1',
        strategyId: 'vs1',
        modelNodeIds: ['mod1'],
        designSystemNodeIds: ['ds1'],
        placeholder: false,
      },
      modelProfiles: {
        mod1: { nodeId: 'mod1', providerId: 'openrouter', modelId: 'x', thinkingLevel: 'medium' },
      },
      designSystems: {
        ds1: { nodeId: 'ds1', title: 'T', content: 'Body', images: [] },
      },
      defaultIncubatorProvider: 'openrouter',
    });
    expect(ctx).not.toBeNull();
    expect(ctx!.modelCredentials).toEqual([
      { providerId: 'openrouter', modelId: 'x', thinkingLevel: 'medium' },
    ]);
    expect(ctx!.designSystemContent).toContain('Body');
  });

  it('uses uploaded Markdown source as design-system fallback when no prepared DESIGN.md exists', () => {
    const ctx = buildHypothesisGenerationContextFromInputs({
      hypothesisNodeId: 'hyp1',
      hypothesisStrategy: strategy,
      spec: minimalSpec,
      snapshot: { nodes: [], edges: [] },
      domainHypothesis: {
        id: 'hyp1',
        incubatorId: 'c1',
        strategyId: 'vs1',
        modelNodeIds: ['mod1'],
        designSystemNodeIds: ['ds1'],
        placeholder: false,
      },
      modelProfiles: {
        mod1: { nodeId: 'mod1', providerId: 'openrouter', modelId: 'x' },
      },
      designSystems: {
        ds1: {
          nodeId: 'ds1',
          title: 'T',
          content: '',
          images: [],
          markdownSources: [
            {
              id: 'md1',
              filename: 'DESIGN.md',
              content: '# Uploaded tokens',
              sizeBytes: 17,
              createdAt: '2026-01-01T00:00:00Z',
            },
          ],
        },
      },
      defaultIncubatorProvider: 'openrouter',
    });
    expect(ctx).not.toBeNull();
    expect(ctx!.designSystemContent).toContain('## Markdown source: DESIGN.md');
    expect(ctx!.designSystemContent).toContain('# Uploaded tokens');
  });

  it('prefers prepared DESIGN.md content over raw uploaded Markdown source', () => {
    const ctx = buildHypothesisGenerationContextFromInputs({
      hypothesisNodeId: 'hyp1',
      hypothesisStrategy: strategy,
      spec: minimalSpec,
      snapshot: { nodes: [], edges: [] },
      domainHypothesis: {
        id: 'hyp1',
        incubatorId: 'c1',
        strategyId: 'vs1',
        modelNodeIds: ['mod1'],
        designSystemNodeIds: ['ds1'],
        placeholder: false,
      },
      modelProfiles: {
        mod1: { nodeId: 'mod1', providerId: 'openrouter', modelId: 'x' },
      },
      designSystems: {
        ds1: {
          nodeId: 'ds1',
          title: 'T',
          content: '',
          images: [],
          markdownSources: [
            {
              id: 'md1',
              filename: 'DESIGN.md',
              content: '# Raw uploaded tokens',
              sizeBytes: 21,
              createdAt: '2026-01-01T00:00:00Z',
            },
          ],
          designMdDocument: {
            content: '# Prepared DESIGN.md',
            sourceHash: 'hash',
            generatedAt: '2026-01-01T00:00:00Z',
            providerId: 'openrouter',
            modelId: 'model',
          },
        },
      },
      defaultIncubatorProvider: 'openrouter',
    });
    expect(ctx).not.toBeNull();
    expect(ctx!.designSystemContent).toContain('# Prepared DESIGN.md');
    expect(ctx!.designSystemContent).not.toContain('Raw uploaded tokens');
  });

  it('falls back to graph when domain lists no models', () => {
    const snapshot = {
      nodes: [
        {
          id: 'm1',
          type: NODE_TYPES.MODEL,
          position: { x: 0, y: 0 },
          data: { modelId: 'lm', providerId: 'lmstudio', thinkingLevel: 'low' },
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
    const ctx = buildHypothesisGenerationContextFromInputs({
      hypothesisNodeId: 'h1',
      hypothesisStrategy: strategy,
      spec: minimalSpec,
      snapshot,
      domainHypothesis: {
        id: 'h1',
        incubatorId: 'c1',
        strategyId: 'vs1',
        modelNodeIds: [],
        designSystemNodeIds: [],
        placeholder: false,
      },
      modelProfiles: {},
      designSystems: {},
      defaultIncubatorProvider: 'openrouter',
    });
    expect(ctx).not.toBeNull();
    expect(ctx!.modelCredentials).toEqual([
      { providerId: 'lmstudio', modelId: 'lm', thinkingLevel: 'low' },
    ]);
  });

  it('buildHypothesisGenerationContextFromInputs uses normalized modelProfiles matching API payload', () => {
    const rawProfiles = {
      mod1: {
        nodeId: 'mod1',
        providerId: '' as string,
        modelId: 'vision-model',
      },
    };
    const normalized = normalizeModelProfilesForApi(rawProfiles, 'openrouter');
    const ctx = buildHypothesisGenerationContextFromInputs({
      hypothesisNodeId: 'hyp1',
      hypothesisStrategy: strategy,
      spec: minimalSpec,
      snapshot: { nodes: [], edges: [] },
      domainHypothesis: {
        id: 'hyp1',
        incubatorId: 'c1',
        strategyId: 'vs1',
        modelNodeIds: ['mod1'],
        designSystemNodeIds: [],
        placeholder: false,
      },
      modelProfiles: normalized,
      designSystems: {},
      defaultIncubatorProvider: 'openrouter',
    });
    expect(ctx).not.toBeNull();
    expect(ctx!.modelCredentials).toEqual([
      { providerId: 'openrouter', modelId: 'vision-model', thinkingLevel: 'minimal' },
    ]);
  });
});
