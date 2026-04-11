import { describe, expect, it } from 'vitest';
import { NODE_TYPES } from '../../constants/canvas';
import { buildAutoConnectEdges } from '../canvas-connections';

describe('buildAutoConnectEdges hypothesis + compiler', () => {
  it('wires the sole compiler to a new hypothesis', () => {
    const existing = [
      { id: 'compiler-a', type: NODE_TYPES.INCUBATOR },
      { id: 'model-1', type: NODE_TYPES.MODEL },
    ];
    const edges = buildAutoConnectEdges('hyp-new', NODE_TYPES.HYPOTHESIS, existing);
    expect(edges.some((e) => e.source === 'compiler-a' && e.target === 'hyp-new')).toBe(true);
  });

  it('does not auto-wire when multiple compilers exist', () => {
    const existing = [
      { id: 'compiler-a', type: NODE_TYPES.INCUBATOR },
      { id: 'compiler-b', type: NODE_TYPES.INCUBATOR },
    ];
    const edges = buildAutoConnectEdges('hyp-new', NODE_TYPES.HYPOTHESIS, existing);
    expect(edges.some((e) => e.target === 'hyp-new' && e.source.startsWith('incubator'))).toBe(
      false,
    );
  });
});
