/**
 * Central registry of all localStorage / IndexedDB key names.
 * Prevents typos and makes it easy to find all persisted state.
 */
export const STORAGE_KEYS = {
  // localStorage (Zustand persist)
  ACTIVE_CANVAS: 'auto-designer-active-canvas',
  CANVAS: 'auto-designer-canvas',
  WORKSPACE_DOMAIN: 'auto-designer-workspace-domain',
  COMPILER: 'auto-designer-compiler',
  GENERATION: 'auto-designer-generation',
  PROMPTS: 'auto-designer-prompts',

  // localStorage (manual)
  CANVASES: 'auto-designer-canvases',
  API_KEYS: 'auto-designer-api-keys',
  MIGRATION_FLAG: 'auto-designer-migrated-idb',

  // IndexedDB database names (idb-keyval)
  IDB_CODE: 'auto-designer-code',
  IDB_PROVENANCE: 'auto-designer-provenance',
  IDB_FILES: 'auto-designer-files',
} as const;

/** Keys backed by localStorage (not IndexedDB DB names). Used by branding migration. */
export const PERSISTED_LOCAL_STORAGE_KEY_NAMES = [
  'ACTIVE_CANVAS',
  'CANVAS',
  'WORKSPACE_DOMAIN',
  'COMPILER',
  'GENERATION',
  'PROMPTS',
  'CANVASES',
  'API_KEYS',
  'MIGRATION_FLAG',
] as const satisfies ReadonlyArray<keyof typeof STORAGE_KEYS>;

export const IDB_DATABASE_KEY_NAMES = ['IDB_CODE', 'IDB_PROVENANCE', 'IDB_FILES'] as const satisfies ReadonlyArray<
  keyof typeof STORAGE_KEYS
>;
