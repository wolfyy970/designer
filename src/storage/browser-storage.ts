import type { StoragePort, GCResult } from './types';
import * as idb from '../services/idb-storage';

export const browserStorage: StoragePort = {
  saveCode: idb.saveCode,
  loadCode: idb.loadCode,
  deleteCode: idb.deleteCode,
  clearAllCodes: idb.clearAllCodes,
  getCodeKeys: idb.getCodeKeys,
  saveProvenance: idb.saveProvenance,
  deleteProvenance: idb.deleteProvenance,
  saveFiles: idb.saveFiles,
  loadFiles: idb.loadFiles,
  deleteFiles: idb.deleteFiles,
  clearAllFiles: idb.clearAllFiles,
  garbageCollect: async (activeResultIds: Set<string>): Promise<GCResult> => {
    return idb.garbageCollect(activeResultIds);
  },
};
