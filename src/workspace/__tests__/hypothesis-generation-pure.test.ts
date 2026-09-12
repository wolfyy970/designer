import { describe, it, expect } from 'vitest';
import {
  buildHypothesisGenerationContextFromInputs,
  workspaceSnapshotWireToGraph,
  type ModelCredential,
} from '../hypothesis-generation-pure';
import type { HypothesisStrategy } from '../../types/incubator';
import type { DesignSpec } from '../../types/spec';
import { EDGE_STATUS, EDGE_TYPES } from '../../constants/canvas';

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

const settingsCred: ModelCredential = {
  providerId: 'openrouter',
  modelId: 'foo/bar',
  thinkingLevel: 'medium',
};

describe('hypothesis-generation-pure', () => {
  it('workspaceSnapshotWireToGraph passes nodes and edges through for graph helpers', () => {
    const wire = { nodes: [{ id: 'a' }], edges: [] };
    const g = workspaceSnapshotWireToGraph(wire);
    expect(g.nodes).toEqual(wire.nodes);
    expect(g.edges).toEqual([]);
  });

  it('uses the settings credential for modelCredentials', () => {
    const ctx = buildHypothesisGenerationContextFromInputs({
      hypothesisNodeId: 'hyp1',
      hypothesisStrategy: strategy,
      spec: minimalSpec,
      snapshot: { nodes: [], edges: [] },
      domainHypothesis: {
        id: 'hyp1',
        incubatorId: 'c1',
        strategyId: 'vs1',
        designSystemNodeIds: ['ds1'],
        placeholder: false,
      },
      designSystems: {
        ds1: { nodeId: 'ds1', title: 'T', content: 'Body', images: [] },
      },
      settingsCredential: settingsCred,
    });
    expect(ctx).not.toBeNull();
    expect(ctx!.modelCredentials).toEqual([settingsCred]);
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
        designSystemNodeIds: ['ds1'],
        placeholder: false,
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
      settingsCredential: settingsCred,
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
        designSystemNodeIds: ['ds1'],
        placeholder: false,
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
      settingsCredential: settingsCred,
    });
    expect(ctx).not.toBeNull();
    expect(ctx!.designSystemContent).toContain('# Prepared DESIGN.md');
    expect(ctx!.designSystemContent).not.toContain('Raw uploaded tokens');
  });

  it('treats Design System Default as an explicit empty context in domain state', () => {
    const ctx = buildHypothesisGenerationContextFromInputs({
      hypothesisNodeId: 'hyp1',
      hypothesisStrategy: strategy,
      spec: minimalSpec,
      snapshot: { nodes: [], edges: [] },
      domainHypothesis: {
        id: 'hyp1',
        incubatorId: 'c1',
        strategyId: 'vs1',
        designSystemNodeIds: ['ds1'],
        placeholder: false,
      },
      designSystems: {
        ds1: {
          nodeId: 'ds1',
          title: 'T',
          sourceMode: 'none',
          content: 'Saved custom notes',
          images: [],
          designMdDocument: {
            content: '# Stale generated DESIGN.md',
            sourceHash: 'hash',
            generatedAt: '2026-01-01T00:00:00Z',
            providerId: 'openrouter',
            modelId: 'model',
          },
        },
      },
      settingsCredential: settingsCred,
    });

    expect(ctx).not.toBeNull();
    expect(ctx!.designSystemContent).toBe('');
  });

  it('treats Design System Default as an explicit empty context in graph fallback', () => {
    const ctx = buildHypothesisGenerationContextFromInputs({
      hypothesisNodeId: 'hyp1',
      hypothesisStrategy: strategy,
      spec: minimalSpec,
      snapshot: {
        nodes: [
          {
            id: 'ds1',
            type: 'designSystem',
            position: { x: 0, y: 0 },
            data: {
              sourceMode: 'none',
              content: 'Saved custom notes',
              designMdDocument: {
                content: '# Stale generated DESIGN.md',
                sourceHash: 'hash',
                generatedAt: '2026-01-01T00:00:00Z',
                providerId: 'openrouter',
                modelId: 'model',
              },
            },
          },
          { id: 'hyp1', type: 'hypothesis', position: { x: 0, y: 0 }, data: {} },
        ],
        edges: [
          {
            id: 'e-ds1-hyp1',
            source: 'ds1',
            target: 'hyp1',
            type: EDGE_TYPES.DATA_FLOW,
            data: { status: EDGE_STATUS.IDLE },
          },
        ],
      },
      domainHypothesis: null,
      designSystems: {},
      settingsCredential: settingsCred,
    });

    expect(ctx).not.toBeNull();
    expect(ctx!.designSystemContent).toBe('');
  });
});
