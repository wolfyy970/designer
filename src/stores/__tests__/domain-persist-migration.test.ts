import { describe, expect, it } from 'vitest';
import { workspaceDomainPersistOptions } from '../workspace-domain-persist';

const migrate = workspaceDomainPersistOptions.migrate;

describe('workspace domain persist migration v5 → v6', () => {
  const v5State = {
    incubatorWirings: {
      inc1: { sectionNodeIds: ['s1'], variantNodeIds: ['vn1', 'vn2'] },
    },
    incubatorModelNodeIds: { inc1: ['m1'] },
    hypotheses: {
      h1: {
        id: 'h1',
        incubatorId: 'inc1',
        variantStrategyId: 'vs1',
        modelNodeIds: ['m1'],
        designSystemNodeIds: [],
        agentMode: 'single',
      },
    },
    modelProfiles: {},
    designSystems: {},
    variantSlots: {
      'h1::vs1': {
        hypothesisId: 'h1',
        variantStrategyId: 'vs1',
        variantNodeId: 'vn1',
        activeResultId: 'r1',
        pinnedRunId: null,
      },
    },
  };

  it('renames variantSlots to previewSlots with updated fields', () => {
    const result = migrate(structuredClone(v5State), 5) as Record<string, unknown>;
    const slots = result.previewSlots as Record<string, Record<string, unknown>>;

    expect(slots['h1::vs1']).toBeDefined();
    expect(slots['h1::vs1'].strategyId).toBe('vs1');
    expect(slots['h1::vs1'].previewNodeId).toBe('vn1');
    expect(slots['h1::vs1'].activeResultId).toBe('r1');
    expect(slots['h1::vs1'].hypothesisId).toBe('h1');
    expect(slots['h1::vs1']).not.toHaveProperty('variantStrategyId');
    expect(slots['h1::vs1']).not.toHaveProperty('variantNodeId');
    expect(result).not.toHaveProperty('variantSlots');
  });

  it('renames variantStrategyId to strategyId on hypotheses', () => {
    const result = migrate(structuredClone(v5State), 5) as Record<string, unknown>;
    const hyps = result.hypotheses as Record<string, Record<string, unknown>>;

    expect(hyps.h1.strategyId).toBe('vs1');
    expect(hyps.h1).not.toHaveProperty('variantStrategyId');
  });

  it('renames variantNodeIds to previewNodeIds on incubator wirings', () => {
    const result = migrate(structuredClone(v5State), 5) as Record<string, unknown>;
    const wirings = result.incubatorWirings as Record<string, Record<string, unknown>>;

    expect(wirings.inc1.previewNodeIds).toEqual(['vn1', 'vn2']);
    expect(wirings.inc1).not.toHaveProperty('variantNodeIds');
  });

  it('handles data already at v6 shape (previewSlots key)', () => {
    const v5AlreadyMigrated = {
      ...v5State,
      previewSlots: {
        'h1::vs1': {
          hypothesisId: 'h1',
          strategyId: 'vs1',
          previewNodeId: 'vn1',
          activeResultId: 'r1',
          pinnedRunId: null,
        },
      },
    };
    delete (v5AlreadyMigrated as Record<string, unknown>).variantSlots;

    const result = migrate(structuredClone(v5AlreadyMigrated), 5) as Record<string, unknown>;
    const slots = result.previewSlots as Record<string, Record<string, unknown>>;
    expect(slots['h1::vs1'].strategyId).toBe('vs1');
  });

  it('handles empty variantSlots gracefully', () => {
    const empty = { ...v5State, variantSlots: {} };
    const result = migrate(structuredClone(empty), 5) as Record<string, unknown>;
    expect(result.previewSlots).toEqual({});
  });

  it('handles missing variantSlots gracefully', () => {
    const noSlots = { ...v5State };
    delete (noSlots as Record<string, unknown>).variantSlots;
    const result = migrate(structuredClone(noSlots), 5) as Record<string, unknown>;
    expect(result.previewSlots).toEqual({});
  });

  it('runs full migration from v0 through latest', () => {
    const v0State = { incubatorWirings: {}, hypotheses: {}, modelProfiles: {} };
    const result = migrate(structuredClone(v0State), 0) as Record<string, unknown>;
    expect(result.incubatorModelNodeIds).toBeDefined();
    expect(result.previewSlots).toBeDefined();
  });
});

describe('workspace domain persist migration v6 → v7', () => {
  it('renames sectionNodeIds to inputNodeIds on incubator wirings', () => {
    const v6State = {
      incubatorWirings: {
        inc1: { sectionNodeIds: ['n1', 'n2'], previewNodeIds: ['p1'] },
      },
      incubatorModelNodeIds: {},
      hypotheses: {},
      modelProfiles: {},
      designSystems: {},
      previewSlots: {},
    };
    const result = migrate(structuredClone(v6State), 6) as Record<string, unknown>;
    const w = (result.incubatorWirings as Record<string, { inputNodeIds: string[]; previewNodeIds: string[] }>).inc1;
    expect(w.inputNodeIds).toEqual(['n1', 'n2']);
    expect(w.previewNodeIds).toEqual(['p1']);
    expect(w).not.toHaveProperty('sectionNodeIds');
  });
});
