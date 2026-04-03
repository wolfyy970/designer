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
  saveRoundFiles(
    resultId: string,
    round: number,
    files: Record<string, string>,
  ): Promise<void>;
  loadRoundFiles(resultId: string, round: number): Promise<Record<string, string> | undefined>;
  deleteRoundFilesForResult(resultId: string): Promise<void>;
  clearAllFiles(): Promise<void>;
  garbageCollect(activeResultIds: Set<string>): Promise<GCResult>;
}
