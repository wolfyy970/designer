import { describe, it, expect } from 'vitest';
import {
  findHypothesisIdForVariantNode,
  getVariantNodeIdsForHypothesis,
} from '../domain-variant-selectors';
import type { DomainVariantSlot } from '../../types/workspace-domain';
import { variantSlotKey } from '../../types/workspace-domain';

describe('domain-variant-selectors', () => {
  const h1 = 'hyp-1';
  const slots: Record<string, DomainVariantSlot> = {
    [variantSlotKey(h1, 'vs-a')]: {
      hypothesisId: h1,
      variantStrategyId: 'vs-a',
      variantNodeId: 'node-a',
      activeResultId: null,
      pinnedRunId: null,
    },
    [variantSlotKey(h1, 'vs-b')]: {
      hypothesisId: h1,
      variantStrategyId: 'vs-b',
      variantNodeId: 'node-b',
      activeResultId: null,
      pinnedRunId: null,
    },
    [variantSlotKey('hyp-2', 'vs-x')]: {
      hypothesisId: 'hyp-2',
      variantStrategyId: 'vs-x',
      variantNodeId: 'node-x',
      activeResultId: null,
      pinnedRunId: null,
    },
  };

  it('findHypothesisIdForVariantNode maps variant node to hypothesis', () => {
    expect(findHypothesisIdForVariantNode(slots, 'node-a')).toBe(h1);
    expect(findHypothesisIdForVariantNode(slots, 'node-x')).toBe('hyp-2');
    expect(findHypothesisIdForVariantNode(slots, 'missing')).toBeUndefined();
  });

  it('getVariantNodeIdsForHypothesis returns slot variant nodes for one hypothesis', () => {
    const ids = getVariantNodeIdsForHypothesis(slots, h1);
    expect(ids).toEqual(['node-a', 'node-b']);
  });

  it('getVariantNodeIdsForHypothesis dedupes', () => {
    const k = variantSlotKey(h1, 'vs-c');
    const dup: Record<string, DomainVariantSlot> = {
      ...slots,
      [k]: {
        hypothesisId: h1,
        variantStrategyId: 'vs-c',
        variantNodeId: 'node-a',
        activeResultId: null,
        pinnedRunId: null,
      },
    };
    const ids = getVariantNodeIdsForHypothesis(dup, h1);
    expect(ids).toEqual(['node-a', 'node-b']);
  });
});
