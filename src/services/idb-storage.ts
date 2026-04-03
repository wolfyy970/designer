/**
 * IndexedDB storage for heavy data (generated code, provenance snapshots).
 * Uses idb-keyval for a simple key-value API over IndexedDB.
 *
 * Separate databases keep code and provenance isolated for independent GC.
 */
import { createStore, get, set, del, keys, clear } from 'idb-keyval';
import type { Provenance } from '../types/provider';
import { STORAGE_KEYS } from '../lib/storage-keys';

const codeStore = createStore(STORAGE_KEYS.IDB_CODE, 'code');
const provenanceStore = createStore(STORAGE_KEYS.IDB_PROVENANCE, 'provenance');
const filesStore = createStore(STORAGE_KEYS.IDB_FILES, 'files');

// ── Generated code ────────────────────────────────────────────────────

export function saveCode(resultId: string, code: string): Promise<void> {
  return set(resultId, code, codeStore);
}

export function loadCode(resultId: string): Promise<string | undefined> {
  return get(resultId, codeStore);
}

export function deleteCode(resultId: string): Promise<void> {
  return del(resultId, codeStore);
}

export function clearAllCodes(): Promise<void> {
  return clear(codeStore);
}

export async function getCodeKeys(): Promise<string[]> {
  return (await keys(codeStore)) as string[];
}

// ── Provenance snapshots ──────────────────────────────────────────────

export function saveProvenance(
  resultId: string,
  provenance: Provenance,
): Promise<void> {
  return set(resultId, provenance, provenanceStore);
}

export function loadProvenance(resultId: string): Promise<Provenance | undefined> {
  return get(resultId, provenanceStore);
}

export function deleteProvenance(resultId: string): Promise<void> {
  return del(resultId, provenanceStore);
}

// ── Virtual filesystem (multi-file agentic results) ──────────────────

export function saveFiles(resultId: string, files: Record<string, string>): Promise<void> {
  return set(resultId, files, filesStore);
}

export function loadFiles(resultId: string): Promise<Record<string, string> | undefined> {
  return get(resultId, filesStore);
}

export function deleteFiles(resultId: string): Promise<void> {
  return del(resultId, filesStore);
}

export function clearAllFiles(): Promise<void> {
  return clear(filesStore);
}

// ── Garbage collection ────────────────────────────────────────────────

/** Delete IndexedDB entries whose keys aren't in the active set. */
export async function garbageCollect(
  activeResultIds: Set<string>,
): Promise<{ codesRemoved: number; provenanceRemoved: number; filesRemoved: number }> {
  let codesRemoved = 0;
  let provenanceRemoved = 0;
  let filesRemoved = 0;

  const codeKeys = await getCodeKeys();
  for (const key of codeKeys) {
    if (!activeResultIds.has(key as string)) {
      await del(key, codeStore);
      codesRemoved++;
    }
  }

  const provKeys = (await keys(provenanceStore)) as string[];
  for (const key of provKeys) {
    if (!activeResultIds.has(key as string)) {
      await del(key, provenanceStore);
      provenanceRemoved++;
    }
  }

  const fileKeys = (await keys(filesStore)) as string[];
  for (const key of fileKeys) {
    if (!activeResultIds.has(key as string)) {
      await del(key, filesStore);
      filesRemoved++;
    }
  }

  return { codesRemoved, provenanceRemoved, filesRemoved };
}
