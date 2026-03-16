import type { Provenance } from '../types/provider';

export interface GCResult {
  codesRemoved: number;
  provenanceRemoved: number;
  filesRemoved: number;
}

export interface StoragePort {
  saveCode(resultId: string, code: string): Promise<void>;
  loadCode(resultId: string): Promise<string | undefined>;
  deleteCode(resultId: string): Promise<void>;
  clearAllCodes(): Promise<void>;
  getCodeKeys(): Promise<string[]>;
  saveProvenance(resultId: string, provenance: Provenance): Promise<void>;
  deleteProvenance(resultId: string): Promise<void>;
  saveFiles(resultId: string, files: Record<string, string>): Promise<void>;
  loadFiles(resultId: string): Promise<Record<string, string> | undefined>;
  deleteFiles(resultId: string): Promise<void>;
  clearAllFiles(): Promise<void>;
  garbageCollect(activeResultIds: Set<string>): Promise<GCResult>;
}
