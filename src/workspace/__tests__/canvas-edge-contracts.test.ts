import { describe, expect, it } from 'vitest';
import { NODE_TYPES } from '../../constants/canvas';
import { VALID_CONNECTIONS } from '../../lib/canvas-connections';
import { CANVAS_EDGE_CONTRACTS, EDGE_DOMAIN_RULES } from '../canvas-edge-contracts';

function sortedConnectionPairs(): string[] {
  return Object.entries(VALID_CONNECTIONS).flatMap(([source, targets]) =>
    Array.from(targets).map((target) => `${source}->${target}`),
  ).sort();
}

describe('canvas edge contracts', () => {
  it('single-sources the current manual connection topology', () => {
    expect(sortedConnectionPairs()).toEqual([
      'designBrief->incubator',
      'designConstraints->incubator',
      'designSystem->hypothesis',
      'designSystem->incubator',
      'hypothesis->preview',
      'incubator->hypothesis',
      'model->designSystem',
      'model->hypothesis',
      'model->incubator',
      'objectivesMetrics->incubator',
      'preview->incubator',
      'researchContext->incubator',
    ]);
  });

  it('keeps domain edge rules backed by declared contracts', () => {
    const contractIds = new Set(CANVAS_EDGE_CONTRACTS.map((contract) => contract.id));
    for (const rule of EDGE_DOMAIN_RULES) {
      expect(contractIds.has(rule.id), `missing contract for ${rule.id}`).toBe(true);
    }
  });

  it('keeps design-system model edges manual-only', () => {
    const contract = CANVAS_EDGE_CONTRACTS.find((entry) => entry.id === 'model-designSystem');
    expect(contract?.match(NODE_TYPES.MODEL, NODE_TYPES.DESIGN_SYSTEM)).toBe(true);
    expect(contract?.paletteModelTarget).toBeUndefined();
    expect(contract?.structuralAutoConnect).toBeUndefined();
  });
});
