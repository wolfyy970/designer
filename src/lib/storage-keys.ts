/**
 * Central registry of all localStorage / IndexedDB key names.
 * Prevents typos and makes it easy to find all persisted state.
 */
export const STORAGE_KEYS = {
  // localStorage (Zustand persist)
  ACTIVE_CANVAS: 'auto-designer-active-canvas',
  CANVAS: 'auto-designer-canvas',
  WORKSPACE_DOMAIN: 'auto-designer-workspace-domain',
  INCUBATOR: 'auto-designer-incubator',
  GENERATION: 'auto-designer-generation',
  PROMPTS: 'auto-designer-prompts',
  EVALUATOR_DEFAULTS: 'auto-designer-evaluator-defaults',
  THINKING_DEFAULTS: 'auto-designer-thinking-defaults',

  // localStorage (manual)
  /** User dismissed the optional-input tip on the canvas (string value is legacy; stable across renames). */
  CANVAS_OPTIONAL_INPUTS_TIP_DISMISSED: 'auto-designer-canvas-optional-sections-tip-dismissed',
  CANVASES: 'auto-designer-canvases',
  MIGRATION_FLAG: 'auto-designer-migrated-idb',

  // IndexedDB database names (idb-keyval)
  IDB_CODE: 'auto-designer-code',
  IDB_PROVENANCE: 'auto-designer-provenance',
  IDB_FILES: 'auto-designer-files',
} as const;

/** Value stored under `STORAGE_KEYS.CANVAS_OPTIONAL_INPUTS_TIP_DISMISSED` when the tip is dismissed. */
export const CANVAS_OPTIONAL_INPUTS_TIP_DISMISSED_VALUE = '1';

/** Keys backed by localStorage (not IndexedDB DB names). Used by branding migration. */
export const PERSISTED_LOCAL_STORAGE_KEY_NAMES = [
  'ACTIVE_CANVAS',
  'CANVAS',
  'WORKSPACE_DOMAIN',
  'INCUBATOR',
  'GENERATION',
  'PROMPTS',
  'EVALUATOR_DEFAULTS',
  'THINKING_DEFAULTS',
  'CANVASES',
  'MIGRATION_FLAG',
] as const satisfies ReadonlyArray<keyof typeof STORAGE_KEYS>;

export const IDB_DATABASE_KEY_NAMES = ['IDB_CODE', 'IDB_PROVENANCE', 'IDB_FILES'] as const satisfies ReadonlyArray<
  keyof typeof STORAGE_KEYS
>;
