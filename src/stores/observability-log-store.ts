import { create } from 'zustand';
import type { ObservabilityLogsResponse } from '../api/types';

interface ObservabilityLogState {
  snapshot: ObservabilityLogsResponse;
  setSnapshot: (snapshot: ObservabilityLogsResponse) => void;
}

export const useObservabilityLogStore = create<ObservabilityLogState>((set) => ({
  snapshot: { llm: [], trace: [] },
  setSnapshot: (snapshot) => set({ snapshot }),
}));
