/**
 * `migrateWorkspaceDomainPersist` runs at the Zustand hydration boundary with no
 * try/catch (`workspace-domain-persist.ts:14`), unlike the canvas store, which
 * wraps its migrator and falls back (`canvas-store.ts:69-77`).
 *
 * That asymmetry matters because a throwing migrator does not fail loudly: the
 * persist middleware's own `.catch` swallows it, the store stays at its empty
 * defaults, and **every hypothesis, incubator wiring, design-system attachment
 * and preview slot is silently gone** — and because the stored version never
 * advances, it repeats on every reload.
 *
 * These tests exercise the shapes a real browser can hold: older persist
 * versions whose rows predate fields that later steps assume exist. Each case
 * asserts that surviving data is preserved, not merely that nothing threw —
 * "does not throw" is exactly the assertion that let this survive.
 */
import { describe, expect, it } from 'vitest';

import { migrateWorkspaceDomainPersist } from '../workspace-domain-migrate';

/** A hypothesis row as an older persist version would have written it. */
const hyp = (over: Record<string, unknown> = {}) => ({
  id: 'h1',
  incubatorId: 'inc1',
  strategyId: 's1',
  designSystemNodeIds: [],
  placeholder: false,
  ...over,
});

const wiring = (over: Record<string, unknown> = {}) => ({
  incubatorId: 'inc1',
  inputNodeIds: ['brief-1'],
  previewNodeIds: [],
  ...over,
});

/** Every case must at minimum migrate without throwing. */
const CASES: Array<{ label: string; version: number; state: Record<string, unknown> }> = [
  { label: 'v2 hypothesis with no modelNodeIds', version: 2, state: { hypotheses: { h1: hyp() } } },
  { label: 'v3 hypothesis with no modelNodeIds', version: 3, state: { hypotheses: { h1: hyp() } } },
  { label: 'v4 hypothesis with no modelNodeIds', version: 4, state: { hypotheses: { h1: hyp() } } },
  {
    label: 'v8 hypothesis with no modelNodeIds',
    version: 8,
    state: { hypotheses: { h1: hyp() } },
  },
  {
    label: 'v9 hypothesis with no modelNodeIds',
    version: 9,
    state: { hypotheses: { h1: hyp() } },
  },
  {
    label: 'v10 wiring with no inputNodeIds',
    version: 10,
    state: { hypotheses: { h1: hyp() }, incubatorWirings: { inc1: wiring({ inputNodeIds: undefined }) } },
  },
  {
    label: 'v11 wiring with no inputNodeIds or sectionNodeIds',
    version: 11,
    state: {
      hypotheses: { h1: hyp() },
      incubatorWirings: { inc1: wiring({ inputNodeIds: undefined, sectionNodeIds: undefined }) },
    },
  },
  {
    label: 'v12 with a completely sparse hypothesis',
    version: 12,
    state: { hypotheses: { h1: { id: 'h1' } } },
  },
  {
    label: 'future version (14) with sparse rows',
    version: 14,
    state: { hypotheses: { h1: { id: 'h1' } }, incubatorWirings: { inc1: {} } },
  },
  {
    label: 'modelNodeIds present but not an array',
    version: 8,
    state: { hypotheses: { h1: hyp({ modelNodeIds: 'brief-1' }) } },
  },
  {
    label: 'inputNodeIds present but not an array',
    version: 10,
    state: { hypotheses: { h1: hyp() }, incubatorWirings: { inc1: wiring({ inputNodeIds: 'brief-1' }) } },
  },
  { label: 'empty state', version: 2, state: {} },
  { label: 'hypotheses is null', version: 12, state: { hypotheses: null } },
];

describe('migrateWorkspaceDomainPersist — totality over sparse persisted shapes', () => {
  it.each(CASES)('migrates $label without throwing', ({ version, state }) => {
    expect(() => migrateWorkspaceDomainPersist(state, version)).not.toThrow();
  });

  it.each(CASES)('preserves the hypothesis row for $label', ({ version, state }) => {
    // The row must survive as an object; dropping it is the silent data loss
    // this suite exists to prevent.
    const out = migrateWorkspaceDomainPersist(state, version) as {
      hypotheses?: Record<string, unknown>;
    };
    const hadHypothesis =
      state.hypotheses != null && typeof state.hypotheses === 'object'
        ? Object.keys(state.hypotheses as object).length > 0
        : false;
    if (hadHypothesis) {
      expect(out.hypotheses?.h1, 'hypothesis h1 was dropped').toBeDefined();
      expect(typeof out.hypotheses?.h1).toBe('object');
    }
  });

  it('is idempotent: migrating twice equals migrating once', () => {
    // The ladder is re-applied by normalisation in the canvas path; the domain
    // migrator must tolerate being handed its own output.
    for (const { version, state } of CASES) {
      const once = migrateWorkspaceDomainPersist(state, version);
      expect(() => migrateWorkspaceDomainPersist(once as Record<string, unknown>, 13)).not.toThrow();
      const twice = migrateWorkspaceDomainPersist(once as Record<string, unknown>, 13);
      expect(twice).toEqual(once);
    }
  });
});
