import { describe, it, expect } from 'vitest';
import {
  ensureCompilerVariantAndDomainForHypothesis,
  hydrateDomainAfterSpecMaterialize,
  removeCompilerPlanForNode,
  removeCompilerStrategyByRefId,
  resetSpecSectionForRemovedNode,
  syncNodeDataToWorkspaceDomain,
} from '../canvas-orchestration';

describe('canvas-orchestration', () => {
  it('exports cross-store orchestration entry points', () => {
    expect(typeof ensureCompilerVariantAndDomainForHypothesis).toBe('function');
    expect(typeof hydrateDomainAfterSpecMaterialize).toBe('function');
    expect(typeof removeCompilerPlanForNode).toBe('function');
    expect(typeof removeCompilerStrategyByRefId).toBe('function');
    expect(typeof resetSpecSectionForRemovedNode).toBe('function');
    expect(typeof syncNodeDataToWorkspaceDomain).toBe('function');
  });
});
