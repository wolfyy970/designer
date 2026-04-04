import { describe, it, expect, vi } from 'vitest';
import { EDGE_STATUS, EDGE_TYPES, NODE_TYPES } from '../../constants/canvas';
import type { DesignSpec, ReferenceImage, SpecSectionId } from '../../types/spec';
import type { WorkspaceEdge, WorkspaceNode } from '../../types/workspace-graph';
import { buildCompileInputs } from '../canvas-graph';

vi.mock('../../services/idb-storage', () => ({
  loadCode: vi.fn().mockResolvedValue(undefined),
}));

function makeSection(id: SpecSectionId, content: string) {
  return {
    id,
    content,
    images: [] as ReferenceImage[],
    lastModified: '2024-01-01T00:00:00Z',
  };
}

function makeSpec(): DesignSpec {
  return {
    id: 'spec-1',
    title: 'T',
    sections: {
      'design-brief': makeSection('design-brief', 'CONNECTED_BRIEF'),
      'existing-design': makeSection('existing-design', 'EXISTING'),
      'research-context': makeSection('research-context', ''),
      'objectives-metrics': makeSection('objectives-metrics', 'OBJ'),
      'design-constraints': makeSection('design-constraints', ''),
      'design-system': makeSection('design-system', ''),
    },
    createdAt: '2024-01-01T00:00:00Z',
    lastModified: '2024-01-01T00:00:00Z',
    version: 1,
  };
}

function node(id: string, type: WorkspaceNode['type']): WorkspaceNode {
  return { id, type, position: { x: 0, y: 0 }, data: {} };
}

describe('buildCompileInputs', () => {
  it('uses domain incubator wiring when non-empty (ignores missing edges to compiler)', async () => {
    const spec = makeSpec();
    const nodes: WorkspaceNode[] = [
      node('brief1', NODE_TYPES.DESIGN_BRIEF),
      node('obj1', NODE_TYPES.OBJECTIVES_METRICS),
    ];
    const edges: WorkspaceEdge[] = [];
    const wiring = {
      sectionNodeIds: ['brief1'],
      variantNodeIds: [] as string[],
    };

    const out = await buildCompileInputs(nodes, edges, spec, 'compiler-orphan', [], wiring);

    expect(out.partialSpec.sections['design-brief'].content).toBe('CONNECTED_BRIEF');
    // Objectives has text in the shared spec even though this wiring lists only the brief node;
    // incubator prompts should still see it.
    expect(out.partialSpec.sections['objectives-metrics'].content).toBe('OBJ');
  });

  it('falls back to incoming edges when wiring is empty or omitted', async () => {
    const spec = makeSpec();
    // Unwired sections with no text stay excluded; if the brief had text here it would still
    // appear because the spec store is shared across section nodes.
    spec.sections['design-brief'].content = '';
    const nodes: WorkspaceNode[] = [
      node('brief1', NODE_TYPES.DESIGN_BRIEF),
      node('obj1', NODE_TYPES.OBJECTIVES_METRICS),
    ];
    const edges: WorkspaceEdge[] = [
      {
        id: 'e1',
        source: 'obj1',
        target: 'comp1',
        type: EDGE_TYPES.DATA_FLOW,
        data: { status: EDGE_STATUS.IDLE },
      },
    ];

    const emptyWiring = {
      sectionNodeIds: [] as string[],
      variantNodeIds: [] as string[],
    };

    const withEdge = await buildCompileInputs(nodes, edges, spec, 'comp1', [], emptyWiring);
    expect(withEdge.partialSpec.sections['objectives-metrics'].content).toBe('OBJ');
    expect(withEdge.partialSpec.sections['design-brief'].content).toBe('');

    const noWiringArg = await buildCompileInputs(nodes, edges, spec, 'comp1', []);
    expect(noWiringArg.partialSpec.sections['objectives-metrics'].content).toBe('OBJ');
    expect(noWiringArg.partialSpec.sections['design-brief'].content).toBe('');
  });
});
