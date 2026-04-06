import { useCallback } from 'react';
import { getActivePromptOverrides, usePromptOverridesStore } from '../stores/prompt-overrides-store';
import { normalizeError } from '../lib/error-utils';

/**
 * Wraps an async call with loading/error state and injects Prompt Studio overrides.
 * Keeps canvas nodes aligned on the same override + normalization pattern.
 */
export function usePromptOverrideAsyncAction() {
  return useCallback(
    async <T,>(
      run: (promptOverrides: Record<string, string> | undefined) => Promise<T>,
      options: {
        setLoading: (v: boolean) => void;
        setError: (msg: string | null) => void;
        errorMessage: string;
      },
    ): Promise<T | undefined> => {
      const { setLoading, setError, errorMessage } = options;
      setLoading(true);
      setError(null);
      try {
        const promptOverrides = getActivePromptOverrides(usePromptOverridesStore.getState().overrides);
        return await run(promptOverrides);
      } catch (err) {
        setError(normalizeError(err, errorMessage));
        return undefined;
      } finally {
        setLoading(false);
      }
    },
    [],
  );
}
