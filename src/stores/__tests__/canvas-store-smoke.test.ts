import { describe, it, expect, beforeEach } from 'vitest';
import { NODE_TYPES } from '../../constants/canvas';
import { useCanvasStore } from '../canvas-store';
import { useWorkspaceDomainStore } from '../workspace-domain-store';
import type { DesignSpec, SpecSection } from '../../types/spec';
import type { WorkspaceNode } from '../../types/workspace-graph';

function section(id: SpecSection['id'], content = ''): SpecSection {
  return {
    id,
    content,
    images: [],
    lastModified: '2026-01-01T00:00:00.000Z',
  };
}

function minimalSpec(sections: Partial<DesignSpec['sections']>): DesignSpec {
  return {
    id: 'spec-1',
    title: 'Spec',
    sections: {
      'design-brief': section('design-brief'),
      'research-context': section('research-context'),
      'objectives-metrics': section('objectives-metrics'),
      'design-constraints': section('design-constraints'),
      'design-system': section('design-system'),
      ...sections,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    lastModified: '2026-01-01T00:00:00.000Z',
    version: 1,
  };
}

describe('canvas-store smoke', () => {
  beforeEach(() => {
    useCanvasStore.getState().reset();
    useWorkspaceDomainStore.getState().reset();
  });

  it('accepts a minimal node list and exposes graph state', () => {
    const model: WorkspaceNode = {
      id: 'model-1',
      type: NODE_TYPES.MODEL,
      position: { x: 0, y: 0 },
      data: { providerId: 'openrouter', modelId: 'm' },
    };
    useCanvasStore.setState({ nodes: [model], edges: [] });
    const { nodes, edges } = useCanvasStore.getState();
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.type).toBe(NODE_TYPES.MODEL);
    expect(edges).toEqual([]);
  });

  it('does not remove required structural nodes', () => {
    const required: WorkspaceNode[] = [
      { id: 'brief-1', type: NODE_TYPES.DESIGN_BRIEF, position: { x: 0, y: 0 }, data: {} },
      { id: 'model-1', type: NODE_TYPES.MODEL, position: { x: 0, y: 0 }, data: {} },
      { id: 'ds-1', type: NODE_TYPES.DESIGN_SYSTEM, position: { x: 0, y: 0 }, data: {} },
      { id: 'inc-1', type: NODE_TYPES.INCUBATOR, position: { x: 0, y: 0 }, data: {} },
      { id: 'ghost-input-researchContext', type: 'inputGhost', position: { x: 0, y: 0 }, data: { targetType: 'researchContext' } },
    ];
    useCanvasStore.setState({ nodes: required, edges: [] });

    for (const node of required) {
      useCanvasStore.getState().removeNode(node.id);
    }

    expect(useCanvasStore.getState().nodes.map((n) => n.id)).toEqual(required.map((n) => n.id));
  });

  it('removing an optional input restores its ghost card', () => {
    useCanvasStore.setState({
      nodes: [
        { id: 'brief-1', type: NODE_TYPES.DESIGN_BRIEF, position: { x: 0, y: 0 }, data: {} },
        { id: 'research-1', type: NODE_TYPES.RESEARCH_CONTEXT, position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [],
    });

    useCanvasStore.getState().removeNode('research-1');

    const nodes = useCanvasStore.getState().nodes;
    expect(nodes.some((n) => n.id === 'research-1')).toBe(false);
    expect(nodes.some((n) => n.type === 'inputGhost' && n.data.targetType === NODE_TYPES.RESEARCH_CONTEXT)).toBe(true);
  });

  it('initializes new canvases with a connected Design System node', () => {
    useCanvasStore.getState().initializeCanvas();

    const { nodes, edges } = useCanvasStore.getState();
    const model = nodes.find((node) => node.type === NODE_TYPES.MODEL);
    const designSystem = nodes.find((node) => node.type === NODE_TYPES.DESIGN_SYSTEM);
    const incubator = nodes.find((node) => node.type === NODE_TYPES.INCUBATOR);

    expect(designSystem).toBeDefined();
    expect(designSystem?.data.sourceMode).toBe('wireframe');
    expect(nodes.some((node) => node.type === 'inputGhost' && node.data.targetType === NODE_TYPES.DESIGN_SYSTEM)).toBe(false);
    expect(edges.some((edge) => edge.source === model?.id && edge.target === designSystem?.id)).toBe(false);
    expect(edges.some((edge) => edge.source === designSystem?.id && edge.target === incubator?.id)).toBe(true);
    expect(useWorkspaceDomainStore.getState().incubatorWirings[incubator!.id]?.designSystemNodeIds).toEqual([designSystem!.id]);
  });

  it('adds the required Design System node when initializing an older canvas without one', () => {
    useCanvasStore.setState({
      nodes: [
        { id: 'brief-1', type: NODE_TYPES.DESIGN_BRIEF, position: { x: 0, y: 0 }, data: {} },
        { id: 'inc-1', type: NODE_TYPES.INCUBATOR, position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [],
    });

    useCanvasStore.getState().initializeCanvas();

    const { nodes, edges } = useCanvasStore.getState();
    const designSystem = nodes.find((node) => node.type === NODE_TYPES.DESIGN_SYSTEM);
    expect(designSystem?.data.sourceMode).toBe('wireframe');
    expect(nodes.some((node) => node.type === 'inputGhost' && node.data.targetType === NODE_TYPES.DESIGN_SYSTEM)).toBe(false);
    expect(edges.some((edge) => edge.source === designSystem?.id && edge.target === 'inc-1')).toBe(true);
  });

  it('records and consumes an ephemeral node focus request', () => {
    const newId = useCanvasStore.getState().addNode(NODE_TYPES.RESEARCH_CONTEXT);
    expect(newId).toBeDefined();

    useCanvasStore.getState().requestNodeFocus(newId!);
    expect(useCanvasStore.getState().pendingFocusNodeId).toBe(newId);

    useCanvasStore.getState().consumePendingNodeFocus();
    expect(useCanvasStore.getState().pendingFocusNodeId).toBeNull();
  });

  it('does not request node focus when materializing optional inputs from a spec', () => {
    useCanvasStore.getState().materializeOptionalInputNodesFromSpec(
      minimalSpec({
        'research-context': section('research-context', 'Known research'),
      }),
    );

    const { nodes, pendingFocusNodeId } = useCanvasStore.getState();
    expect(nodes.some((n) => n.type === NODE_TYPES.RESEARCH_CONTEXT)).toBe(true);
    expect(pendingFocusNodeId).toBeNull();
  });

  it('removeEdge detaches model and design-system hypothesis wiring from the domain store', () => {
    useCanvasStore.setState({
      nodes: [
        { id: 'inc-1', type: NODE_TYPES.INCUBATOR, position: { x: 0, y: 0 }, data: {} },
        { id: 'model-1', type: NODE_TYPES.MODEL, position: { x: 0, y: 0 }, data: {} },
        { id: 'ds-1', type: NODE_TYPES.DESIGN_SYSTEM, position: { x: 0, y: 0 }, data: {} },
        { id: 'hyp-1', type: NODE_TYPES.HYPOTHESIS, position: { x: 0, y: 0 }, data: { refId: 'strategy-1' } },
      ],
      edges: [
        { id: 'e-model-hyp', source: 'model-1', target: 'hyp-1', type: 'dataFlow', data: { status: 'idle' } },
        { id: 'e-ds-hyp', source: 'ds-1', target: 'hyp-1', type: 'dataFlow', data: { status: 'idle' } },
      ],
    });
    const domain = useWorkspaceDomainStore.getState();
    domain.linkHypothesisToIncubator('hyp-1', 'inc-1', 'strategy-1');
    domain.attachModelToTarget('model-1', 'hyp-1', NODE_TYPES.HYPOTHESIS);
    domain.attachDesignSystemToHypothesis('ds-1', 'hyp-1');

    useCanvasStore.getState().removeEdge('e-model-hyp');
    useCanvasStore.getState().removeEdge('e-ds-hyp');

    expect(useWorkspaceDomainStore.getState().hypotheses['hyp-1']?.modelNodeIds).toEqual([]);
    expect(useWorkspaceDomainStore.getState().hypotheses['hyp-1']?.designSystemNodeIds).toEqual([]);
  });

  it('disconnectOutputs detaches incubator model and input wiring from the domain store', () => {
    useCanvasStore.setState({
      nodes: [
        { id: 'brief-1', type: NODE_TYPES.DESIGN_BRIEF, position: { x: 0, y: 0 }, data: {} },
        { id: 'model-1', type: NODE_TYPES.MODEL, position: { x: 0, y: 0 }, data: {} },
        { id: 'ds-1', type: NODE_TYPES.DESIGN_SYSTEM, position: { x: 0, y: 0 }, data: {} },
        { id: 'inc-1', type: NODE_TYPES.INCUBATOR, position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [
        { id: 'e-brief-inc', source: 'brief-1', target: 'inc-1', type: 'dataFlow', data: { status: 'idle' } },
        { id: 'e-model-inc', source: 'model-1', target: 'inc-1', type: 'dataFlow', data: { status: 'idle' } },
        { id: 'e-ds-inc', source: 'ds-1', target: 'inc-1', type: 'dataFlow', data: { status: 'idle' } },
      ],
    });
    const domain = useWorkspaceDomainStore.getState();
    domain.ensureIncubatorWiring('inc-1');
    domain.attachIncubatorInput('inc-1', 'brief-1', NODE_TYPES.DESIGN_BRIEF);
    domain.attachIncubatorInput('inc-1', 'ds-1', NODE_TYPES.DESIGN_SYSTEM);
    domain.attachModelToTarget('model-1', 'inc-1', NODE_TYPES.INCUBATOR);

    useCanvasStore.getState().disconnectOutputs('brief-1');
    useCanvasStore.getState().disconnectOutputs('model-1');
    useCanvasStore.getState().disconnectOutputs('ds-1');

    const nextDomain = useWorkspaceDomainStore.getState();
    expect(nextDomain.incubatorWirings['inc-1']?.inputNodeIds).toEqual([]);
    expect(nextDomain.incubatorWirings['inc-1']?.designSystemNodeIds).toEqual([]);
    expect(nextDomain.incubatorModelNodeIds['inc-1']).toEqual([]);
  });
});
