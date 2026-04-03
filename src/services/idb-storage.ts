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

/** Key pattern: `{resultId}:round:{round}` — keep in sync with garbageCollect. */
export function roundFilesKey(resultId: string, round: number): string {
  return `${resultId}:round:${round}`;
}

export function saveRoundFiles(
  resultId: string,
  round: number,
  files: Record<string, string>,
): Promise<void> {
  return set(roundFilesKey(resultId, round), files, filesStore);
}

export function loadRoundFiles(
  resultId: string,
  round: number,
): Promise<Record<string, string> | undefined> {
  return get(roundFilesKey(resultId, round), filesStore);
}

/** Remove all persisted eval-round file snapshots for a result. */
export async function deleteRoundFilesForResult(resultId: string): Promise<void> {
  const prefix = `${resultId}:round:`;
  const fileKeys = (await keys(filesStore)) as string[];
  for (const key of fileKeys) {
    if (typeof key === 'string' && key.startsWith(prefix)) {
      await del(key, filesStore);
    }
  }
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
  const roundSep = ':round:';
  for (const key of fileKeys) {
    const k = key as string;
    const roundIdx = k.indexOf(roundSep);
    const ownerId = roundIdx === -1 ? k : k.slice(0, roundIdx);
    if (!activeResultIds.has(ownerId)) {
      await del(key, filesStore);
      filesRemoved++;
    }
  }

  return { codesRemoved, provenanceRemoved, filesRemoved };
}
