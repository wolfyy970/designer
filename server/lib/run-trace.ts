import type { RunTraceEvent } from '../../src/types/provider.ts';

export function makeRunTraceEvent(
  fields: Omit<RunTraceEvent, 'id' | 'at'> & Partial<Pick<RunTraceEvent, 'id' | 'at'>>,
): RunTraceEvent {
  return {
    ...fields,
    id: fields.id ?? crypto.randomUUID(),
    at: fields.at ?? new Date().toISOString(),
  };
}
