/**
 * Central registry of all localStorage / IndexedDB key names.
 * Prevents typos and makes it easy to find all persisted state.
 */
export const STORAGE_KEYS = {
  // localStorage (Zustand persist)
  ACTIVE_CANVAS: 'lattice-active-canvas',
  CANVAS: 'lattice-canvas',
  WORKSPACE_DOMAIN: 'lattice-workspace-domain',
  COMPILER: 'lattice-compiler',
  GENERATION: 'lattice-generation',
  PROMPTS: 'lattice-prompts',

  // localStorage (manual)
  CANVASES: 'lattice-canvases',
  API_KEYS: 'lattice-api-keys',
  MIGRATION_FLAG: 'lattice-migrated-idb',

  // IndexedDB store names
  IDB_CODE: 'lattice-code',
  IDB_PROVENANCE: 'lattice-provenance',
  IDB_FILES: 'lattice-files',
} as const;
