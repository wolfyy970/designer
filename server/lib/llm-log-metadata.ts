import { getProvider } from '../services/providers/registry.ts';

/** Provider id + optional display name for LLM log rows. */
export function providerLogFields(providerId: string): { provider: string; providerName?: string } {
  const name = getProvider(providerId)?.name;
  return name && name !== providerId ? { provider: providerId, providerName: name } : { provider: providerId };
}
