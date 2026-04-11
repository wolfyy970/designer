import { describe, it, expect } from 'vitest';
import {
  findHypothesisIdForPreviewNode,
  getPreviewNodeIdsForHypothesis,
} from '../domain-preview-selectors';
import type { DomainPreviewSlot } from '../../types/workspace-domain';
import { previewSlotKey } from '../../types/workspace-domain';

describe('domain-preview-selectors', () => {
  const h1 = 'hyp-1';
  const slots: Record<string, DomainPreviewSlot> = {
    [previewSlotKey(h1, 'vs-a')]: {
      hypothesisId: h1,
      strategyId: 'vs-a',
      previewNodeId: 'node-a',
      activeResultId: null,
      pinnedRunId: null,
    },
    [previewSlotKey(h1, 'vs-b')]: {
      hypothesisId: h1,
      strategyId: 'vs-b',
      previewNodeId: 'node-b',
      activeResultId: null,
      pinnedRunId: null,
    },
    [previewSlotKey('hyp-2', 'vs-x')]: {
      hypothesisId: 'hyp-2',
      strategyId: 'vs-x',
      previewNodeId: 'node-x',
      activeResultId: null,
      pinnedRunId: null,
    },
  };

  it('findHypothesisIdForPreviewNode maps preview node to hypothesis', () => {
    expect(findHypothesisIdForPreviewNode(slots, 'node-a')).toBe(h1);
    expect(findHypothesisIdForPreviewNode(slots, 'node-x')).toBe('hyp-2');
    expect(findHypothesisIdForPreviewNode(slots, 'missing')).toBeUndefined();
  });

  it('getPreviewNodeIdsForHypothesis returns slot preview nodes for one hypothesis', () => {
    const ids = getPreviewNodeIdsForHypothesis(slots, h1);
    expect(ids).toEqual(['node-a', 'node-b']);
  });

  it('getPreviewNodeIdsForHypothesis dedupes', () => {
    const k = previewSlotKey(h1, 'vs-c');
    const dup: Record<string, DomainPreviewSlot> = {
      ...slots,
      [k]: {
        hypothesisId: h1,
        strategyId: 'vs-c',
        previewNodeId: 'node-a',
        activeResultId: null,
        pinnedRunId: null,
      },
    };
    const ids = getPreviewNodeIdsForHypothesis(dup, h1);
    expect(ids).toEqual(['node-a', 'node-b']);
  });
});
