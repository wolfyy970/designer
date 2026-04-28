import { describe, expect, it } from 'vitest';
import { NODE_TYPES } from '../../constants/canvas';
import type { DesignSpec } from '../../types/spec';
import type { IncubationPlan } from '../../types/incubator';
import type { DomainHypothesis, DomainIncubatorWiring } from '../../types/workspace-domain';
import type { WorkspaceEdge, WorkspaceNode } from '../../types/workspace-graph';
import {
  buildIncubatorRunInputs,
  collectExistingIncubatorStrategies,
} from '../incubator-run-inputs';

const spec: DesignSpec = {
  id: 'spec-1',
  title: 'Spec',
  createdAt: '2026-01-01T00:00:00Z',
  lastModified: '2026-01-01T00:00:00Z',
  version: 1,
  sections: {
    'design-brief': {
      id: 'design-brief',
      content: 'Improve onboarding.',
      images: [],
      lastModified: '2026-01-01T00:00:00Z',
    },
  },
};

const strategy = {
  id: 'st-1',
  name: 'Guided',
  hypothesis: 'A guided flow helps.',
  rationale: 'Less uncertainty.',
  measurements: 'Completion',
  dimensionValues: {},
};

describe('incubator run input assembly', () => {
  it('collects only non-placeholder strategies for the active incubator', () => {
    const incubationPlans: Record<string, IncubationPlan> = {
      'inc-1': {
        id: 'plan-1',
        specId: 'spec-1',
        dimensions: [],
        hypotheses: [strategy],
        generatedAt: '2026-01-01T00:00:00Z',
        incubatorModel: 'm',
      },
    };
    const hypotheses: Record<string, DomainHypothesis> = {
      h1: {
        id: 'h1',
        incubatorId: 'inc-1',
        strategyId: 'st-1',
        modelNodeIds: [],
        designSystemNodeIds: [],
        placeholder: false,
      },
      h2: {
        id: 'h2',
        incubatorId: 'inc-1',
        strategyId: 'st-placeholder',
        modelNodeIds: [],
        designSystemNodeIds: [],
        placeholder: true,
      },
    };

    expect(collectExistingIncubatorStrategies({ incubatorId: 'inc-1', incubationPlans, hypotheses })).toEqual([
      strategy,
    ]);
  });

  it('builds one request input object from an explicit snapshot', async () => {
    const nodes: WorkspaceNode[] = [
      { id: 'inc-1', type: NODE_TYPES.INCUBATOR, position: { x: 0, y: 0 }, data: {} },
      { id: 'brief-1', type: NODE_TYPES.DESIGN_BRIEF, position: { x: 0, y: 0 }, data: {} },
    ];
    const edges: WorkspaceEdge[] = [
      { id: 'brief-1->inc-1', source: 'brief-1', target: 'inc-1', type: 'dataFlow', data: { status: 'idle' } },
    ];
    const wiring: DomainIncubatorWiring = {
      inputNodeIds: ['brief-1'],
      previewNodeIds: [],
      designSystemNodeIds: [],
    };

    const out = await buildIncubatorRunInputs({
      snapshot: {
        incubatorId: 'inc-1',
        nodes,
        edges,
        spec,
        results: [],
        wiring,
        incubationPlans: {},
        hypotheses: {},
      },
      hypothesisCount: 3,
      internalContextDocument: '# Context',
      designSystemDocuments: [{ nodeId: 'ds-1', title: 'DS', content: '# DS' }],
    });

    expect(out.spec.id).toBe('spec-1');
    expect(out.internalContextDocument).toBe('# Context');
    expect(out.designSystemDocuments).toEqual([{ nodeId: 'ds-1', title: 'DS', content: '# DS' }]);
    expect(out.promptOptions).toEqual({ count: 3, existingStrategies: [] });
  });
});
