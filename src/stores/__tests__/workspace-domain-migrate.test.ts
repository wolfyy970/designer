import { describe, expect, it } from 'vitest';
import { migrateWorkspaceDomainPersist } from '../workspace-domain-migrate';

describe('migrateWorkspaceDomainPersist', () => {
  it('adds incubatorModelNodeIds when migrating from v1', () => {
    const v1 = { hypotheses: {}, modelProfiles: {} };
    const out = migrateWorkspaceDomainPersist(v1, 1) as Record<string, unknown>;
    expect(out.incubatorModelNodeIds).toEqual({});
  });

  it('v8 → v9 truncates hypothesis modelNodeIds to one entry', () => {
    const v8 = {
      hypotheses: {
        h1: {
          id: 'h1',
          incubatorId: 'inc',
          strategyId: 's1',
          modelNodeIds: ['m1', 'm2'],
          designSystemNodeIds: [],
          placeholder: false,
          revisionEnabled: true,
        },
      },
      modelProfiles: {},
      incubatorWirings: {},
      previewSlots: {},
    };
    const out = migrateWorkspaceDomainPersist(v8, 8) as {
      hypotheses: Record<string, { modelNodeIds: string[] }>;
    };
    expect(out.hypotheses.h1!.modelNodeIds).toEqual(['m1']);
  });

  it('is idempotent for already-v9-shaped data', () => {
    const v9 = {
      hypotheses: { h1: { id: 'h1', modelNodeIds: ['a'] } },
      modelProfiles: {},
      incubatorWirings: {},
      previewSlots: {},
      designSystems: {},
      incubatorModelNodeIds: {},
    };
    const out = migrateWorkspaceDomainPersist(v9, 9) as typeof v9;
    expect(out).toEqual(v9);
  });

  it('normalizes malformed top-level collections to empty records', () => {
    const out = migrateWorkspaceDomainPersist(
      {
        hypotheses: 'bad',
        modelProfiles: null,
        incubatorWirings: [],
        previewSlots: 42,
        designSystems: undefined,
        incubatorModelNodeIds: 'bad',
      },
      10,
    ) as Record<string, unknown>;
    expect(out).toEqual({
      hypotheses: {},
      modelProfiles: {},
      incubatorWirings: {},
      previewSlots: {},
      designSystems: {},
      incubatorModelNodeIds: {},
    });
  });
});
