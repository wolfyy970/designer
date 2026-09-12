import type { WorkspaceDomainStore } from './workspace-domain-store-types';
import { STORAGE_KEYS } from '../lib/storage-keys';
import { migrateWorkspaceDomainPersist } from './workspace-domain-migrate';

export const workspaceDomainPersistOptions = {
  name: STORAGE_KEYS.WORKSPACE_DOMAIN,
  partialize: (state: WorkspaceDomainStore) => ({
    incubatorWirings: state.incubatorWirings,
    hypotheses: state.hypotheses,
    designSystems: state.designSystems,
    previewSlots: state.previewSlots,
  }),
  version: 13,
  /**
   * Wrapped for the same reason `canvas-store.ts:69-77` wraps its migrator: a
   * throw here does not surface. Zustand's hydration `.catch` swallows it, the
   * store keeps its empty defaults, and every hypothesis, wiring, design-system
   * attachment and preview slot is silently gone — repeatedly, because the
   * stored version never advances.
   *
   * The migrator is now total over the shapes a browser can hold (see
   * `workspace-domain-migrate-totality.test.ts`), so this is a backstop for a
   * shape nobody anticipated — including one written by a *newer* build.
   * Degrading to the empty state is the same choice the canvas store makes; the
   * log line is what makes it diagnosable instead of mysterious.
   */
  migrate: (persistedState: unknown, version: number) => {
    try {
      return migrateWorkspaceDomainPersist(persistedState, version);
    } catch (e) {
      console.error(
        '[workspace-domain] persist migration failed; falling back to an empty domain state',
        e,
      );
      return migrateWorkspaceDomainPersist({}, version);
    }
  },
};
