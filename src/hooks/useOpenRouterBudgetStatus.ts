import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchOpenRouterBudgetStatus } from '../api/client';
import { OPENROUTER_BUDGET_REFRESH_EVENT } from '../lib/openrouter-budget';

export const OPENROUTER_BUDGET_STATUS_QUERY_KEY = ['provider-status', 'openrouter'] as const;

export function useOpenRouterBudgetStatus() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: OPENROUTER_BUDGET_STATUS_QUERY_KEY });
    };
    window.addEventListener(OPENROUTER_BUDGET_REFRESH_EVENT, refresh);
    return () => window.removeEventListener(OPENROUTER_BUDGET_REFRESH_EVENT, refresh);
  }, [queryClient]);

  return useQuery({
    queryKey: OPENROUTER_BUDGET_STATUS_QUERY_KEY,
    queryFn: ({ signal }) => fetchOpenRouterBudgetStatus(signal),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
