import { describe, it, expect } from 'vitest';
import { countConnectedIncubatorInputs } from '../incubator-input-count';
import type { DomainIncubatorWiring } from '../../types/workspace-domain';

const INC = 'incubator-1';

const brief = { id: 'brief-1', type: 'designBrief' as const };
const research = { id: 'research-1', type: 'researchContext' as const };
const objectives = { id: 'obj-1', type: 'objectivesMetrics' as const };
const constraints = { id: 'cons-1', type: 'designConstraints' as const };
const preview = { id: 'preview-1', type: 'preview' as const };
const model = { id: 'model-1', type: 'model' as const };
const hypothesis = { id: 'hyp-1', type: 'hypothesis' as const };
const incubatorNode = { id: INC, type: 'incubator' as const };

describe('countConnectedIncubatorInputs', () => {
  describe('edge fallback (no domain wiring)', () => {
    it('counts incoming edges from input-typed sources', () => {
      const nodes = [incubatorNode, brief, research, model];
      const edges = [
        { source: brief.id, target: INC },
        { source: research.id, target: INC },
        { source: model.id, target: INC },
      ];
      // model is NOT an input type → not counted
      expect(countConnectedIncubatorInputs(nodes, edges, INC)).toBe(2);
    });

    it('counts preview sources (reference designs)', () => {
      const nodes = [incubatorNode, brief, preview];
      const edges = [
        { source: brief.id, target: INC },
        { source: preview.id, target: INC },
      ];
      expect(countConnectedIncubatorInputs(nodes, edges, INC)).toBe(2);
    });

    it('dedupes when multiple edges share the same source (no double-count)', () => {
      const nodes = [incubatorNode, brief];
      const edges = [
        { source: brief.id, target: INC },
        { source: brief.id, target: INC },
      ];
      expect(countConnectedIncubatorInputs(nodes, edges, INC)).toBe(1);
    });

    it('ignores edges to other targets', () => {
      const nodes = [incubatorNode, brief, hypothesis];
      const edges = [
        { source: brief.id, target: INC },
        { source: brief.id, target: hypothesis.id },
      ];
      expect(countConnectedIncubatorInputs(nodes, edges, INC)).toBe(1);
    });

    it('ignores edges pointing at dangling sources (deleted nodes)', () => {
      const nodes = [incubatorNode, brief];
      const edges = [
        { source: brief.id, target: INC },
        { source: 'ghost-id', target: INC },
      ];
      expect(countConnectedIncubatorInputs(nodes, edges, INC)).toBe(1);
    });
  });

  describe('domain wiring is preferred when non-empty', () => {
    it('counts live inputs + previews', () => {
      const wiring: DomainIncubatorWiring = {
        inputNodeIds: [brief.id, research.id],
        previewNodeIds: [preview.id],
      };
      const nodes = [incubatorNode, brief, research, preview];
      expect(countConnectedIncubatorInputs(nodes, [], INC, wiring)).toBe(3);
    });

    it('BUG FIX: drops stale ids pointing to deleted nodes (mirrors buildIncubateInputs)', () => {
      // User had brief + research + objectives connected. Removed research + objectives.
      // If domain wiring was not fully cleaned, inputNodeIds still holds 3 entries.
      // `buildIncubateInputs` silently drops stale ids — the UI must match so the
      // count the user sees matches what the incubator actually receives.
      const wiring: DomainIncubatorWiring = {
        inputNodeIds: [brief.id, 'ghost-research', 'ghost-objectives'],
        previewNodeIds: [],
      };
      const nodes = [incubatorNode, brief];
      expect(countConnectedIncubatorInputs(nodes, [], INC, wiring)).toBe(1);
    });

    it('falls back to edge count when every wired id is stale', () => {
      const wiring: DomainIncubatorWiring = {
        inputNodeIds: ['ghost-a', 'ghost-b'],
        previewNodeIds: ['ghost-c'],
      };
      const nodes = [incubatorNode, brief, constraints];
      const edges = [
        { source: brief.id, target: INC },
        { source: constraints.id, target: INC },
      ];
      expect(countConnectedIncubatorInputs(nodes, edges, INC, wiring)).toBe(2);
    });

    it('falls back to edges when both domain lists are empty', () => {
      const wiring: DomainIncubatorWiring = {
        inputNodeIds: [],
        previewNodeIds: [],
      };
      const nodes = [incubatorNode, brief, objectives];
      const edges = [
        { source: brief.id, target: INC },
        { source: objectives.id, target: INC },
      ];
      expect(countConnectedIncubatorInputs(nodes, edges, INC, wiring)).toBe(2);
    });
  });

  it('returns 0 for a fresh incubator with nothing connected', () => {
    expect(
      countConnectedIncubatorInputs([incubatorNode], [], INC, null),
    ).toBe(0);
  });
});
