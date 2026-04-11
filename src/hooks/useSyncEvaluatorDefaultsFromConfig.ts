import { useEffect } from 'react';
import { useAppConfig } from './useAppConfig';
import { useEvaluatorDefaultsStore } from '../stores/evaluator-defaults-store';

/** One-time seed of evaluator defaults from GET /api/config (operator env), before user customizes. */
export function useSyncEvaluatorDefaultsFromConfig() {
  const { data, isPlaceholderData } = useAppConfig();
  useEffect(() => {
    if (!data || isPlaceholderData) return;
    useEvaluatorDefaultsStore.getState().seedFromServerConfig(data);
  }, [data, isPlaceholderData]);
}
