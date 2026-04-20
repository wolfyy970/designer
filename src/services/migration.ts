/**
 * Startup migrations: copy legacy `lattice-*` storage into `auto-designer-*`, then
 * one-time move of generated code from localStorage to IndexedDB.
 */
import { createStore, get, set, keys } from 'idb-keyval';
import {
  IDB_DATABASE_KEY_NAMES,
  PERSISTED_LOCAL_STORAGE_KEY_NAMES,
  STORAGE_KEYS,
} from '../lib/storage-keys';
import { saveCode } from './idb-storage';

const NEW_PREFIX = 'auto-designer-';
const LEGACY_PREFIX = 'lattice-';
const LEGACY_PREFIX_MIGRATION_FLAG = 'auto-designer-legacy-prefix-migrated-v1';

const MIGRATION_FLAG = STORAGE_KEYS.MIGRATION_FLAG;
const GENERATION_STORE_KEY = STORAGE_KEYS.GENERATION;

function idbObjectStoreName(name: (typeof IDB_DATABASE_KEY_NAMES)[number]): string {
  if (name === 'IDB_CODE') return 'code';
  if (name === 'IDB_PROVENANCE') return 'provenance';
  return 'files';
}

/**
 * Copy data from legacy `lattice-*` localStorage / IndexedDB into `auto-designer-*`.
 * Runs once per browser profile (flag in localStorage).
 */
export async function migrateLegacyStoragePrefixes(): Promise<void> {
  if (localStorage.getItem(LEGACY_PREFIX_MIGRATION_FLAG)) return;

  try {
    for (const keyName of PERSISTED_LOCAL_STORAGE_KEY_NAMES) {
      const newKey = STORAGE_KEYS[keyName];
      const suffix = newKey.startsWith(NEW_PREFIX) ? newKey.slice(NEW_PREFIX.length) : newKey;
      const oldKey = LEGACY_PREFIX + suffix;
      if (localStorage.getItem(newKey) == null) {
        const v = localStorage.getItem(oldKey);
        if (v !== null) localStorage.setItem(newKey, v);
      }
      localStorage.removeItem(oldKey);
    }

    for (const name of IDB_DATABASE_KEY_NAMES) {
      const newDb = STORAGE_KEYS[name];
      const suffix = newDb.startsWith(NEW_PREFIX) ? newDb.slice(NEW_PREFIX.length) : newDb;
      const oldDb = LEGACY_PREFIX + suffix;
      const store = idbObjectStoreName(name);
      const legacy = createStore(oldDb, store);
      const next = createStore(newDb, store);
      const nextKeyList = await keys(next);
      if (nextKeyList.length > 0) continue;
      const oldKeyList = await keys(legacy);
      for (const k of oldKeyList) {
        const v = await get(k, legacy);
        if (v !== undefined) await set(k, v, next);
      }
    }

    localStorage.setItem(LEGACY_PREFIX_MIGRATION_FLAG, '1');
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[migration] Legacy storage prefix rename failed:', err);
    }
  }
}

interface PersistedResult {
  id: string;
  code?: string;
  runId?: string;
  runNumber?: number;
  [key: string]: unknown;
}

/**
 * Move generated code from the persisted generation store into IndexedDB.
 * Runs after branding migration so GENERATION_STORE_KEY matches on-disk data.
 */
export async function migrateToIndexedDB(): Promise<void> {
  if (localStorage.getItem(MIGRATION_FLAG)) return;

  try {
    const raw = localStorage.getItem(GENERATION_STORE_KEY);
    if (!raw) {
      localStorage.setItem(MIGRATION_FLAG, '1');
      return;
    }

    const parsed = JSON.parse(raw);
    // Zustand persist wraps state in { state: ..., version: ... }
    const state = parsed?.state;
    if (!state?.results || !Array.isArray(state.results)) {
      localStorage.setItem(MIGRATION_FLAG, '1');
      return;
    }

    const results = state.results as PersistedResult[];
    let migrated = 0;

    for (const result of results) {
      // Save code to IndexedDB if present
      if (result.code) {
        await saveCode(result.id, result.code);
        delete result.code;
        migrated++;
      }

      // Backfill run tracking fields
      if (!result.runId) result.runId = 'legacy';
      if (!result.runNumber) result.runNumber = 1;
    }

    // Ensure selectedVersions exists
    if (!state.selectedVersions) {
      state.selectedVersions = {};
    }

    // Write updated state back (code stripped)
    localStorage.setItem(GENERATION_STORE_KEY, JSON.stringify(parsed));
    localStorage.setItem(MIGRATION_FLAG, '1');

    if (import.meta.env.DEV && migrated > 0) {
      console.log(`[migration] Moved code for ${migrated} result(s) to IndexedDB`);
    }
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[migration] Failed to migrate to IndexedDB:', err);
    }
    // Do not set MIGRATION_FLAG — allow retry on next load if localStorage/IDB was inconsistent.
  }
}
