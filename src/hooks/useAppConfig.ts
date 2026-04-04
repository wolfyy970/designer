import { useQuery } from '@tanstack/react-query';
import { fetchAppConfig, getPlaceholderAppConfig } from '../api/client';

/**
 * Server-driven flags (e.g. LOCKDOWN). Uses placeholder matching default server behavior until fetch completes.
 */
export function useAppConfig() {
  return useQuery({
    queryKey: ['app-config'],
    queryFn: ({ signal }) => fetchAppConfig(signal),
    staleTime: Infinity,
    gcTime: Infinity,
    placeholderData: getPlaceholderAppConfig(),
  });
}
