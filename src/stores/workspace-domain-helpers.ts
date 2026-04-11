import type { DomainIncubatorWiring } from '../types/workspace-domain';
import { defaultIncubatorWiring } from '../types/workspace-domain';

export function uniqPush(arr: string[], id: string): string[] {
  if (arr.includes(id)) return arr;
  return [...arr, id];
}

export function removeId(arr: string[], id: string): string[] {
  return arr.filter((x) => x !== id);
}

export function ensureWiring(
  wirings: Record<string, DomainIncubatorWiring>,
  incubatorId: string,
): DomainIncubatorWiring {
  return wirings[incubatorId] ?? defaultIncubatorWiring();
}

